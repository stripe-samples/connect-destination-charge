package com.stripe.sample;

import java.nio.file.Paths;

import java.util.HashMap;
import java.util.Map;

import static spark.Spark.get;
import static spark.Spark.post;
import static spark.Spark.port;
import static spark.Spark.staticFiles;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.stripe.Stripe;
import com.stripe.exception.*;

import io.github.cdimascio.dotenv.Dotenv;

import com.stripe.model.PaymentIntent;
import com.stripe.model.Account;
import com.stripe.model.AccountCollection;
import com.stripe.model.LoginLink;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.net.Webhook;

public class Server {
    private static Gson gson = new Gson();

    static class CreateResponse {
        private String publishableKey;
        private String clientSecret;

        public CreateResponse(String publishableKey, String clientSecret) {
            this.publishableKey = publishableKey;
            this.clientSecret = clientSecret;
        }
    }

    static class CreateParams {
        private Object[] items;
        private String account;
        private String currency;
    }

    static class AccountsResponse {
        private AccountCollection accounts;

        public AccountsResponse(AccountCollection accounts) {
            this.accounts = accounts;
        }
    }

    static class LoginLinkResponse {
        private String url;

        public LoginLinkResponse(String url) {
            this.url = url;
        }
    }

    private static int calculateOrderAmount(Object[] items) {
        // Replace this constant with a calculation of the order's amount
        // Calculate the order total on the server to prevent
        // people from directly manipulating the amount on the client
        return 1400;
    }

    private static int calculateApplicationFeeAmount(int amount) {
        return (int) (0.1 * amount);
    }

    public static void main(String[] args) {
        port(4242);
        Dotenv dotenv = Dotenv.load();
        Stripe.apiKey = dotenv.get("STRIPE_SECRET_KEY");
        staticFiles.externalLocation(
                Paths.get(Paths.get("").toAbsolutePath().toString(), dotenv.get("STATIC_DIR")).normalize().toString());

        get("/", (request, response) -> {
            response.type("application/json");

            Map<String, Object> responseData = new HashMap<>();
            responseData.put("some_key", "some_value");
            return gson.toJson(responseData);
        });

        post("/create-payment-intent", (request, response) -> {
            response.type("application/json");

            CreateParams data = gson.fromJson(request.body(), CreateParams.class);
            int amount = calculateOrderAmount(data.items);

            Map<String, Object> params = new HashMap<>();
            params.put("amount", amount);
            params.put("currency", data.currency);
            Map<String, Object> transferDataParams = new HashMap<>();
            transferDataParams.put("destination", data.account);
            params.put("transfer_data", transferDataParams);
            params.put("application_fee_amount", calculateApplicationFeeAmount(amount));
            PaymentIntent paymentIntent = PaymentIntent.create(params);

            return gson.toJson(new CreateResponse(
                dotenv.get("STRIPE_PUBLISHABLE_KEY"),
                paymentIntent.getClientSecret()
            ));
        });

        get("/recent-accounts", (request, response) -> {
            Map<String, Object> params = new HashMap<>();
            params.put("limit", 10);
            AccountCollection accounts = Account.list(params);
            return gson.toJson(new AccountsResponse(accounts));
        });

        get("/express-dashboard-link", (request, response) -> {
            String accountId = request.queryParams("account_id");
            Map<String, Object> params = new HashMap<>();
            params.put("redirect_url", request.scheme() + "://" + request.host());
            LoginLink link = LoginLink.createOnAccount(accountId, params, null);
            return gson.toJson(new LoginLinkResponse(link.getUrl()));
        });

        post("/webhook", (request, response) -> {
            String payload = request.body();
            String sigHeader = request.headers("Stripe-Signature");

            // Uncomment and replace with a real secret. You can find your endpoint's
            // secret in your webhook settings.
            // String webhookSecret = "whsec_..."

            Event event = null;

            // Verify webhook signature and extract the event.
            // See https://stripe.com/docs/webhooks/signatures for more information.
            try {
                event = Webhook.constructEvent(
                    payload, sigHeader, dotenv.get("STRIPE_WEBHOOK_SECRET")
                );
            } catch (JsonSyntaxException e) {
            // Invalid payload.
                response.status(400);
                return "";
            } catch (SignatureVerificationException e) {
            // Invalid Signature.
                response.status(400);
                return "";
            }

            if ("payment_intent.succeeded".equals(event.getType())) {
                // Deserialize the nested object inside the event
                EventDataObjectDeserializer dataObjectDeserializer = event.getDataObjectDeserializer();
                PaymentIntent paymentIntent = null;
                if (dataObjectDeserializer.getObject().isPresent()) {
                paymentIntent = (PaymentIntent) dataObjectDeserializer.getObject().get();
                handleSuccessfulPaymentIntent(paymentIntent);
                } else {
                // Deserialization failed, probably due to an API version mismatch.
                // Refer to the Javadoc documentation on `EventDataObjectDeserializer` for
                // instructions on how to handle this case, or return an error here.
                }
            }

            response.status(200);
            return "";
        });
    }

    private static void handleSuccessfulPaymentIntent(PaymentIntent paymentIntent) {
        // Fulfill the purchase.
        System.out.println("PaymentIntent ID: " + paymentIntent.getId());
    }
}