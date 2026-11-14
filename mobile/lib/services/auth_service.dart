import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../bridge/bridge_error.dart';
import '../config/env.dart';

/// Native sign-in used inside the WebView shell. The web bridge calls
/// `auth.googleSignIn` / `auth.appleSignIn`, we run the native flow, then hand
/// back the id token so the web app can finish with `signInWithCredential`.
class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  // scopes: default email+profile is enough for Firebase Auth's
  // GoogleAuthProvider.credential(idToken, accessToken).
  // iOS: client id passed explicitly (Env.googleIosClientId); Android: read
  // from google-services.json.
  final GoogleSignIn _google = GoogleSignIn(
    clientId: Platform.isIOS && Env.googleIosClientId.isNotEmpty
        ? Env.googleIosClientId
        : null,
  );

  Future<Map<String, Object?>> signInGoogle() async {
    if (Platform.isIOS && Env.googleIosClientId.isEmpty) {
      // Never reach GIDSignIn unconfigured: it throws an Objective-C
      // exception that the plugin re-raises, killing the app.
      throw AuthError(
        'not_configured',
        'Google sign-in isn\'t available on iPhone yet. Tap "Use demo mode" to continue.',
      );
    }
    // signIn() shows the account picker; silent flows are the wrong call here
    // because the user just tapped "Continue with Google" and expects the UI.
    final GoogleSignInAccount? account;
    try {
      account = await _google.signIn();
    } on PlatformException catch (e) {
      if (e.code == 'sign_in_canceled') {
        throw AuthError('cancelled', 'Sign-in cancelled by the user.');
      }
      if (e.code == 'network_error') {
        throw AuthError('network_error', 'No connection. Check your internet and try again.');
      }
      throw AuthError('google_failed', 'Google sign-in failed. Please try again.');
    }
    if (account == null) {
      throw AuthError('cancelled', 'Sign-in cancelled by the user.');
    }
    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw AuthError('no_id_token', 'Google did not return an id token.');
    }
    return {
      'idToken': idToken,
      'accessToken': auth.accessToken,
      'email': account.email,
      'displayName': account.displayName,
      'photoUrl': account.photoUrl,
    };
  }

  Future<void> signOutGoogle() async {
    await _google.signOut();
  }

  /// Sign in with Apple (iOS only). App Store Review Guideline 4.8 requires
  /// it whenever Google sign-in is offered. Firebase needs the *raw* nonce
  /// back, while Apple is given its SHA-256, so both travel to the web side.
  Future<Map<String, Object?>> signInApple() async {
    if (!Platform.isIOS) {
      throw AuthError('unsupported', 'Sign in with Apple is only available on iOS.');
    }
    final rawNonce = _randomNonce();
    final hashedNonce = sha256.convert(utf8.encode(rawNonce)).toString();

    final AuthorizationCredentialAppleID credential;
    try {
      credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: hashedNonce,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw AuthError('cancelled', 'Sign-in cancelled by the user.');
      }
      throw AuthError('apple_failed', e.message);
    }

    final idToken = credential.identityToken;
    if (idToken == null || idToken.isEmpty) {
      throw AuthError('no_id_token', 'Apple did not return an identity token.');
    }

    // Apple only sends the name on the very first authorization.
    final name = [credential.givenName, credential.familyName]
        .whereType<String>()
        .where((part) => part.trim().isNotEmpty)
        .join(' ');

    return {
      'idToken': idToken,
      'rawNonce': rawNonce,
      'authorizationCode': credential.authorizationCode,
      'email': credential.email,
      'displayName': name.isEmpty ? null : name,
    };
  }

  String _randomNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(length, (_) => charset[random.nextInt(charset.length)])
        .join();
  }
}

class AuthError extends BridgeError {
  AuthError(super.code, super.message);

  @override
  String toString() => 'AuthError($code): $message';
}
