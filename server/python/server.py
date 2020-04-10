#! /usr/bin/env python3.6

"""
server.py
Stripe Sample.
Python 3.6 or newer required.
"""

import json
import os
import random
import string

import stripe
from dotenv import load_dotenv, find_dotenv
from flask import Flask, jsonify, render_template, redirect, request, session, send_from_directory, Response
import urllib

# Setup Stripe python client library
load_dotenv(find_dotenv())
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
stripe.api_version = os.getenv('STRIPE_API_VERSION', '2019-12-03')

static_dir = str(os.path.abspath(os.path.join(__file__ , "..", os.getenv("STATIC_DIR"))))
app = Flask(__name__, static_folder=static_dir,
            static_url_path="", template_folder=static_dir)

# Set the secret key to some random bytes. Keep this really secret!
# This enables Flask sessions.
app.secret_key = b'_5#y2L"F4Q8z\n\xec]/'

@app.route('/', methods=['GET'])
def get_example():
    return render_template('index.html')


def calculate_order_amount(items):
    # Replace this constant with a calculation of the order's amount
    # Calculate the order total on the server to prevent
    # people from directly manipulating the amount on the client
    return 1400


def calculate_application_fee_amount(amount):
    return int(.1 * amount)


@app.route('/create-payment-intent', methods=['POST'])
def create_payment():
    data = json.loads(request.data)
    amount = calculate_order_amount(data['items'])

    # Create a PaymentIntent with the order amount, currency, and transfer destination
    intent = stripe.PaymentIntent.create(
        amount=amount,
        currency=data['currency'],
        transfer_data={'destination': data['account']},
        application_fee_amount=calculate_application_fee_amount(amount)
    )

    try:
        # Send publishable key and PaymentIntent details to client
        return jsonify({'publishableKey': os.getenv('STRIPE_PUBLISHABLE_KEY'), 'clientSecret': intent.client_secret})
    except Exception as e:
        return jsonify(error=str(e)), 403


@app.route("/recent-accounts", methods=["GET"])
def get_accounts():
    accounts = stripe.Account.list(limit=10)
    return jsonify({'accounts': accounts})


@app.route("/express-dashboard-link", methods=["GET"])
def get_express_dashboard_link():
    account_id = request.args.get('account_id')
    link = stripe.Account.create_login_link(account_id, redirect_url=(request.url_root))
    return jsonify({'url': link.url})


@app.route("/webhook", methods=["POST"])
def webhook_received():
  payload = request.get_data()
  signature = request.headers.get("stripe-signature")

  # Verify webhook signature and extract the event.
  # See https://stripe.com/docs/webhooks/signatures for more information.
  try:
    event = stripe.Webhook.construct_event(
        payload=payload, sig_header=signature, secret=os.getenv('STRIPE_WEBHOOK_SECRET')
    )
  except ValueError as e:
    # Invalid payload.
    print(e)
    return Response(status=400)
  except stripe.error.SignatureVerificationError as e:
    # Invalid Signature.
    print(e, signature, os.getenv('STRIPE_WEBHOOK_SECRET'), payload)
    return Response(status=400)

  if event["type"] == "payment_intent.succeeded":
    payment_intent = event["data"]["object"]
    handle_successful_payment_intent(payment_intent)

  return json.dumps({"success": True}), 200


def handle_successful_payment_intent(payment_intent):
  # Fulfill the purchase.
  print('PaymentIntent: ' + str(payment_intent))


if __name__== '__main__':
    app.run(port=4242)
