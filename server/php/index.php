<?php
use Slim\Http\Request;
use Slim\Http\Response;
use Stripe\Stripe;

require 'vendor/autoload.php';

$dotenv = Dotenv\Dotenv::create(__DIR__);
$dotenv->load();

require './config.php';

$app = new \Slim\App;

// Instantiate the logger as a dependency
$container = $app->getContainer();
$container['logger'] = function ($c) {
  $settings = $c->get('settings')['logger'];
  $logger = new Monolog\Logger($settings['name']);
  $logger->pushProcessor(new Monolog\Processor\UidProcessor());
  $logger->pushHandler(new Monolog\Handler\StreamHandler(__DIR__ . '/logs/app.log', \Monolog\Logger::DEBUG));
  return $logger;
};

$app->add(function ($request, $response, $next) {
    Stripe::setApiKey(getenv('STRIPE_SECRET_KEY'));
    return $next($request, $response);
});

function calculateOrderAmount($items) {
	// Replace this constant with a calculation of the order's amount
	// Calculate the order total on the server to prevent
	// people from directly manipulating the amount on the client
	return 1400;
}

function calculateApplicationFeeAmount($amount) {
	return 0.1 * $amount;
}

$app->post('/create-payment-intent', function (Request $request, Response $response, array $args) {
  $data = json_decode($request->getBody(), true);
  $amount = calculateOrderAmount($data['items']);

  $paymentIntent = \Stripe\PaymentIntent::create([
    'amount' => $amount,
    'currency' => $data['currency'],
    'transfer_data' => ['destination' => $data['account']],
    'application_fee_amount' => calculateApplicationFeeAmount($amount),
  ]);
  
  return $response->withJson(array(
    'publishableKey' => getenv('STRIPE_PUBLISHABLE_KEY'),
    'clientSecret' => $paymentIntent->client_secret,
  ));
});

$app->get('/recent-accounts', function (Request $request, Response $response, array $args) {
  $accounts = \Stripe\Account::all(['limit' => 10]);
  return $response->withJson(array('accounts' => $accounts));
});

$app->get('/express-dashboard-link', function (Request $request, Response $response, array $args) {
  extract($request->getQueryParams());
  $link = \Stripe\Account::createLoginLink(
    $account_id,
    ['redirect_url' => $request->getUri()->getBaseUrl()]
  );
  return $response->withJson(array('url' => $link->url));
});

$app->post('/webhook', function ($request, $response, $next) {
  $payload = $request->getBody();
  $sig_header = $request->getHeaderLine('stripe-signature');

  $event = null;

  // Verify webhook signature and extract the event.
  // See https://stripe.com/docs/webhooks/signatures for more information.
  try {
    $event = \Stripe\Webhook::constructEvent(
      $payload, $sig_header, getenv('STRIPE_WEBHOOK_SECRET')
    );
  } catch(\UnexpectedValueException $e) {
    // Invalid payload.
    return $response->withStatus(400);
  } catch(\Stripe\Exception\SignatureVerificationException $e) {
    // Invalid Signature.
    return $response->withStatus(400);
  }

  if ($event->type == 'payment_intent.succeeded') {
    $paymentIntent = $event->data->object;
    handleSuccessfulPaymentIntent($paymentIntent);
  }

  return $response->withStatus(200);
});

function handleSuccessfulPaymentIntent($paymentIntent) {
  // Fulfill the purchase.
  echo 'PaymentIntent: ' . $paymentIntent;
};

$app->get('/', function (Request $request, Response $response, array $args) {   
  return $response->write(file_get_contents(getenv('STATIC_DIR') . '/index.html'));
});

$app->run();
