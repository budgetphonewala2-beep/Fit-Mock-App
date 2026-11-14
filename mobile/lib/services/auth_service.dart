import 'package:google_sign_in/google_sign_in.dart';

/// Native Google Sign-In used inside the WebView shell. The web bridge calls
/// `auth.googleSignIn`, we run the native flow, then hand back the id token so
/// the web app can complete the sign-in with `signInWithCredential`.
class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  // scopes: default email+profile is enough for Firebase Auth's
  // GoogleAuthProvider.credential(idToken, accessToken).
  final GoogleSignIn _google = GoogleSignIn();

  Future<Map<String, Object?>> signInGoogle() async {
    // signIn() shows the account picker; silent flows are the wrong call here
    // because the user just tapped "Continue with Google" and expects the UI.
    final account = await _google.signIn();
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
}

class AuthError implements Exception {
  AuthError(this.code, this.message);
  final String code;
  final String message;
  @override
  String toString() => 'AuthError($code): $message';
}
