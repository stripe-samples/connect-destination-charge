# frozen_string_literal: true

require 'stripe'
require 'sinatra'
require 'dotenv'

# Replace if using a different env file or config
Dotenv.load
Stripe.api_key = ENV['STRIPE_SECRET_KEY']

enable :sessions
set :static, true
set :public_folder, File.join(File.dirname(__FILE__), ENV['STATIC_DIR'])
set :port, 4242

helpers do
  def request_headers
    env.each_with_object({}) { |(k, v), acc| acc[Regexp.last_match(1).downcase] = v if k =~ /^http_(.*)/i; }
  end
end

get '/' do
  content_type 'text/html'
  send_file File.join(settings.public_folder, 'index.html')
end

def calculate_order_amount(items)
  # Replace this constant with a calculation of the order's amount
  # Calculate the order total on the server to prevent
  # people from directly manipulating the amount on the client
  1400
end


def calculate_application_fee_amount(amount)
  (0.1 * amount).to_i
end

post '/create-payment-intent' do
  data = JSON.parse(request.body.read)
  amount = calculate_order_amount(data['items'])

  payment_intent = Stripe::PaymentIntent.create({
    amount: amount,
    currency: data['currency'],
    application_fee_amount: calculate_application_fee_amount(amount),
    transfer_data: {
      destination: data['account'],
    },
  })

  {
    'publishableKey': ENV['STRIPE_PUBLISHABLE_KEY'],
    'clientSecret': payment_intent.client_secret
  }.to_json
end

get '/recent-accounts' do
  accounts = Stripe::Account.list({limit: 10})
  {'accounts': accounts}.to_json
end

get '/express-dashboard-link' do
  account_id = params[:account_id]
  link = Stripe::Account.create_login_link(account_id, redirect_url: (request.base_url))
  {'url': link.url}.to_json
end

post '/webhook' do
  payload = request.body.read
  sig_header = request.env['HTTP_STRIPE_SIGNATURE']

  event = nil

  # Verify webhook signature and extract the event.
  # See https://stripe.com/docs/webhooks/signatures for more information.
  begin
    event = Stripe::Webhook.construct_event(
      payload, sig_header, ENV['STRIPE_WEBHOOK_SECRET']
    )
  rescue JSON::ParserError => e
    # Invalid payload.
    puts e
    status 400
    return
  rescue Stripe::SignatureVerificationError => e
    # Invalid Signature.
    puts payload
    puts sig_header
    puts ENV['STRIPE_WEBHOOK_SECRET']
    status 400
    return
  end

  if event['type'] == 'payment_intent.succeeded'
    payment_intent = event['data']['object']
    handle_successful_payment_intent(payment_intent)
  end

  status 200
end

def handle_successful_payment_intent(payment_intent)
  # Fulfill the purchase.
  puts 'PaymentIntent: ' + payment_intent.to_s
end