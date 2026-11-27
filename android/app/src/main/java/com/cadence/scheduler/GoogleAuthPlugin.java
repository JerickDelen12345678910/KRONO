package com.cadence.scheduler;

import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeGoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private static final String WEB_CLIENT_ID = "529235584995-tfuc44or5be9ibrbgk9gss7edfgq4sso.apps.googleusercontent.com";@PluginMethod
    public void signIn(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }

        CredentialManager credentialManager = CredentialManager.create(getContext());
        GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(WEB_CLIENT_ID)
                .setAutoSelectEnabled(false)
                .build();

        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build();

        credentialManager.getCredentialAsync(
                getActivity(),
                request,
                new CancellationSignal(),
                Executors.newSingleThreadExecutor(),
                new CredentialManagerCallback<GetCredentialResponse, androidx.credentials.exceptions.GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse result) {
                        Credential credential = result.getCredential();
                        if (credential instanceof CustomCredential &&
                                GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            try {
                                GoogleIdTokenCredential googleCred = GoogleIdTokenCredential.createFrom(credential.getData());
                                JSObject ret = new JSObject();
                                ret.put("idToken", googleCred.getIdToken());
                                call.resolve(ret);
                            } catch (Exception e) {
                                call.reject("Invalid Google ID token: " + e.getMessage());
                            }
                        } else {
                            call.reject("Unexpected credential type");
                        }
                    }

                    @Override
                    public void onError(@NonNull androidx.credentials.exceptions.GetCredentialException e) {
                        call.reject("Google Sign-In failed: " + e.getMessage());
                    }
                }
        );
    }
}