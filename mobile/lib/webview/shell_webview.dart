import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:image_picker/image_picker.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bridge/bridge.dart';
import '../bridge/web_channel.dart';
import '../config/env.dart';
import '../services/notifications_service.dart';
import 'bridge_bootstrap.dart';

class ShellWebView extends StatefulWidget {
  const ShellWebView({super.key});

  @override
  State<ShellWebView> createState() => _ShellWebViewState();
}

class _ShellWebViewState extends State<ShellWebView>
    with WidgetsBindingObserver {
  InAppWebViewController? _controller;
  final _picker = ImagePicker();
  PullToRefreshController? _pullToRefresh;

  bool _loading = true;
  bool _errored = false;
  String? _bootstrapJs;

  StreamSubscription<Map<String, dynamic>>? _notifTapSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _pullToRefresh = PullToRefreshController(
      settings: PullToRefreshSettings(color: const Color(0xFFF97316)),
      onRefresh: () async {
        if (Platform.isAndroid) {
          await _controller?.reload();
        } else {
          final url = await _controller?.getUrl();
          if (url != null) {
            await _controller?.loadUrl(urlRequest: URLRequest(url: url));
          }
        }
      },
    );

    _prepareBootstrap();

    _notifTapSub =
        NotificationsService.instance.notificationTaps.listen((payload) {
      WebChannel.instance.emit('notification.opened', payload);
    });
  }

  Future<void> _prepareBootstrap() async {
    final info = await PackageInfo.fromPlatform();
    setState(() {
      _bootstrapJs = bridgeBootstrapFor(
        platform: Platform.isIOS ? 'ios' : 'android',
        version: info.version,
      );
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _notifTapSub?.cancel();
    final controller = _controller;
    if (controller != null) WebChannel.instance.detach(controller);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      WebChannel.instance.emit('app.foreground');
    } else if (state == AppLifecycleState.paused) {
      WebChannel.instance.emit('app.background');
    }
  }

  Future<bool> _onWillPop() async {
    final controller = _controller;
    if (controller == null) return true;
    if (!await controller.canGoBack()) return true;

    // Peek at what going back would land on. If it's about:blank, an
    // external OAuth handoff, or anything else outside the site, exit the
    // app rather than showing a blank/half-loaded page.
    final history = await controller.getCopyBackForwardList();
    final currentIndex = history?.currentIndex;
    final list = history?.list;
    if (history == null || currentIndex == null || list == null || currentIndex <= 0) {
      return true;
    }
    final prevUrl = list[currentIndex - 1].url;
    if (prevUrl == null ||
        prevUrl.scheme == 'about' ||
        !Env.isInternalUrl(prevUrl)) {
      return true;
    }

    await controller.goBack();
    return false;
  }

  /// Handles photo and video inputs natively. The plugin's default chooser
  /// starts the camera without a file to save into (its file provider is
  /// missing), so a shot taken from it never reached the page.
  /// - `<input capture>` (diet camera button): straight to the camera.
  /// - Other image/video inputs (Coach attach): a small sheet to take a photo
  ///   or pick from the gallery. The gallery uses Android's photo picker,
  ///   which needs no photo permission.
  /// Anything else (documents) keeps the default chooser.
  Future<ShowFileChooserResponse?> _onShowFileChooser(
    InAppWebViewController controller,
    ShowFileChooserRequest request,
  ) async {
    final types = request.acceptTypes.where((t) => t.isNotEmpty).toList();
    final wantsImage = types.isEmpty || types.any((t) => t.startsWith('image/'));
    final wantsVideo = types.any((t) => t.startsWith('video/'));
    if (!wantsImage && !wantsVideo) {
      return ShowFileChooserResponse(handledByClient: false);
    }

    try {
      final source = request.isCaptureEnabled && wantsImage
          ? _MediaSource.camera
          : await _askMediaSource(allowCamera: wantsImage);
      final XFile? file;
      switch (source) {
        case null:
          file = null;
        case _MediaSource.camera:
          file = await _picker.pickImage(
            source: ImageSource.camera,
            // The page compresses again before upload; this just keeps the
            // file small enough to pass through the WebView quickly.
            maxWidth: 2048,
            maxHeight: 2048,
            imageQuality: 90,
          );
        case _MediaSource.gallery:
          file = wantsImage && wantsVideo
              ? await _picker.pickMedia(maxWidth: 2048, maxHeight: 2048, imageQuality: 90)
              : wantsVideo
                  ? await _picker.pickVideo(source: ImageSource.gallery)
                  : await _picker.pickImage(
                      source: ImageSource.gallery,
                      maxWidth: 2048,
                      maxHeight: 2048,
                      imageQuality: 90,
                    );
      }
      return ShowFileChooserResponse(
        handledByClient: true,
        filePaths: file == null ? null : [Uri.file(file.path).toString()],
      );
    } catch (e) {
      debugPrint('[shell] media pick failed: $e');
      return ShowFileChooserResponse(handledByClient: true, filePaths: null);
    }
  }

  Future<_MediaSource?> _askMediaSource({required bool allowCamera}) {
    if (!mounted) return Future.value(null);
    return showModalBottomSheet<_MediaSource>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (allowCamera)
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Take photo'),
                onTap: () => Navigator.pop(sheetContext, _MediaSource.camera),
              ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(sheetContext, _MediaSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<NavigationActionPolicy> _shouldOverride(
    InAppWebViewController controller,
    NavigationAction action,
  ) async {
    final uri = action.request.url;
    if (uri == null) return NavigationActionPolicy.ALLOW;

    // Route mailto/tel/sms and other schemes to the OS.
    if (!(uri.scheme == 'http' || uri.scheme == 'https' || uri.scheme == 'about')) {
      unawaited(_openExternal(uri));
      return NavigationActionPolicy.CANCEL;
    }

    final parsed = Uri.tryParse(uri.rawValue);
    if (parsed != null && !Env.isInternalUrl(parsed)) {
      unawaited(_openExternal(uri));
      return NavigationActionPolicy.CANCEL;
    }

    return NavigationActionPolicy.ALLOW;
  }

  Future<void> _openExternal(WebUri uri) async {
    final parsed = Uri.tryParse(uri.rawValue);
    if (parsed == null) return;
    final launched =
        await launchUrl(parsed, mode: LaunchMode.externalApplication);
    if (!launched) debugPrint('Failed to open external url: $uri');
  }

  @override
  Widget build(BuildContext context) {
    if (_bootstrapJs == null) {
      // While PackageInfo resolves, show a bare sand-coloured scaffold that
      // matches the NormalTheme windowBackground. The default Material
      // Scaffold is white and the stock spinner tints it, which flashes for
      // a frame or two between the teal launch splash and the WebView
      // loader. This holds the sand through the transition instead.
      return const Scaffold(
        backgroundColor: Color(0xFFF5F1E8),
        body: SizedBox.shrink(),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final shouldPop = await _onWillPop();
        if (!context.mounted) return;
        // The shell is the root route, so Navigator.pop() leaves the Activity
        // alive with nothing rendered — Android paints that as a black screen
        // that survives a relaunch (Android resumes the same empty Activity).
        // SystemNavigator.pop() signals Android to finish the Activity so the
        // next launch starts a fresh shell.
        if (shouldPop) await SystemNavigator.pop();
      },
      child: Scaffold(
        // Let the WebView keep its full height when the keyboard opens so
        // window.visualViewport shrinks — useKeyboardInset on the web side
        // reads that to hide the bottom nav while typing.
        resizeToAvoidBottomInset: false,
        // Match the web app's sand background (--background: #f5f1e8) so
        // the strip reserved for the transparent Android nav / iOS home
        // indicator blends into the page instead of showing a Material
        // scaffold color.
        backgroundColor: const Color(0xFFF5F1E8),
        // Reserve both the status bar (top) and the Android nav / iOS home
        // indicator (bottom) for the OS: the WebView never extends behind
        // either strip, so the web app's bottom nav doesn't tuck under the
        // system bar and doesn't have to guess a floor via env(). The web
        // side keeps a small aesthetic gutter via --screen-pad-bottom.
        body: SafeArea(
          top: true,
          bottom: true,
          child: Stack(
            children: [
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(Env.shellUrl)),
                pullToRefreshController: _pullToRefresh,
                initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  transparentBackground: true,
                  allowsInlineMediaPlayback: true,
                  mediaPlaybackRequiresUserGesture: false,
                  useShouldOverrideUrlLoading: true,
                  supportZoom: false,
                  useHybridComposition: true,
                  applicationNameForUserAgent: 'FitmonkShell/1.0',
                  isInspectable: kDebugMode,
                  useOnShowFileChooser: true,
                ),
                onShowFileChooser: _onShowFileChooser,
                onWebViewCreated: (controller) {
                  _controller = controller;
                  WebChannel.instance.attach(controller);

                  controller.addJavaScriptHandler(
                    handlerName: '_fitmonkBridge',
                    callback: (args) async {
                      if (args.length < 2) {
                        return {
                          '__bridge_error': true,
                          'code': 'bad_args',
                          'message': 'expected [method, params]',
                        };
                      }
                      final method = args[0] as String;
                      final rawParams = args[1];
                      final params = rawParams is Map
                          ? rawParams.cast<String, dynamic>()
                          : <String, dynamic>{};
                      return await Bridge.instance.handle(method, params);
                    },
                  );
                },
                onLoadStart: (_, __) {
                  if (mounted) {
                    setState(() {
                      _loading = true;
                      _errored = false;
                    });
                  }
                },
                onLoadStop: (controller, url) async {
                  _pullToRefresh?.endRefreshing();
                  await controller.evaluateJavascript(source: _bootstrapJs!);
                  if (mounted) setState(() => _loading = false);
                },
                onReceivedError: (controller, request, error) {
                  _pullToRefresh?.endRefreshing();
                  if (!(request.isForMainFrame ?? false)) return;
                  if (mounted) {
                    setState(() {
                      _loading = false;
                      _errored = true;
                    });
                  }
                },
                onPermissionRequest: (controller, request) async {
                  // Grant camera/mic/geo prompts inline; the web app is trusted.
                  return PermissionResponse(
                    resources: request.resources,
                    action: PermissionResponseAction.GRANT,
                  );
                },
                shouldOverrideUrlLoading: _shouldOverride,
                onConsoleMessage: (_, msg) {
                  if (kDebugMode) debugPrint('[web] ${msg.message}');
                },
              ),
              if (_loading && !_errored)
                const Positioned.fill(
                  child: IgnorePointer(
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
              if (_errored) _ErrorOverlay(onRetry: () => _controller?.reload()),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorOverlay extends StatelessWidget {
  const _ErrorOverlay({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: ColoredBox(
        color: Colors.white,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.wifi_off, size: 40, color: Colors.black45),
                const SizedBox(height: 12),
                const Text(
                  'Couldn\'t reach Fitmonk',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Check your connection and try again.',
                  style: TextStyle(color: Colors.black54),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _MediaSource { camera, gallery }
