import 'package:flutter/material.dart';

import 'webview/shell_webview.dart';

class FitmonkShellApp extends StatelessWidget {
  const FitmonkShellApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fitmonk',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFF97316)),
        useMaterial3: true,
      ),
      home: const ShellWebView(),
    );
  }
}
