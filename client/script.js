var paymentForm = document.getElementById("payment-form");
var paymentIntentData = {
  // You might send a list of items the customer is purchasing so that you can compute
  // the price on the server.
  items: [{ id: "photo-subscription" }],
  currency: "usd"
};

// Secret from the server, which we'll overwrite each time we create a new payment intent.
var paymentIntentClientSecret = null;

// Set up Stripe.js and Elements to use in checkout form
var setupElements = function(data) {
  stripe = Stripe(data.publishableKey);
  var elements = stripe.elements();
  var style = {
    base: {
      color: "#32325d",
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: "antialiased",
      fontSize: "16px",
      "::placeholder": {
        color: "#aab7c4"
      }
    },
    invalid: {
      color: "#fa755a",
      iconColor: "#fa755a"
    }
  };

  var card = elements.create("card", { style: style });
  card.mount("#card-element");

  // Handle form submission.
  paymentForm.addEventListener("submit", function(event) {
    event.preventDefault();
    // Initiate payment when the submit button is clicked
    pay(stripe, card, paymentIntentClientSecret);
  });
};

/*
  * Calls stripe.confirmCardPayment which creates a pop-up modal to
  * prompt the user to enter extra authentication details without leaving your page
  */
var pay = function(stripe, card, clientSecret) {
  changeLoadingState(true);

  // Initiate the payment.
  // If authentication is required, confirmCardPayment will automatically display a modal
  stripe
    .confirmCardPayment(clientSecret, {
      payment_method: {
        card: card
      }
    })
    .then(function(result) {
      if (result.error) {
        // Show error to your customer
        showError(result.error.message);
      } else {
        // The payment has been processed!
        orderComplete(clientSecret);
      }
    });
};

const updatePaymentIntent = (account, shouldSetupElements = false) => {
  // Disable the button while we fetch the payment intent.
  paymentForm.querySelector("button").disabled = true;

  // The account will be used as the transfer_data[destination] parameter when creating the
  // PaymentIntent on the server side.
	paymentIntentData.account = account;

  fetch("/create-payment-intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(paymentIntentData)
  })
    .then(function(result) {
      return result.json();
    })
    .then(function(data) {
			paymentIntentClientSecret = data.clientSecret
			if (shouldSetupElements) {
				setupElements(data);
			}

			paymentForm.querySelector("button").disabled = false;
    });
}

// When the selected account changes, create a new PaymentIntent on the server
// side and update the front-end accordingly.
var enabledAccounts = document.querySelector("#enabled-accounts-select")
enabledAccounts.addEventListener("change", function(event) {
	updatePaymentIntent(enabledAccounts.value);
});
  
/* ------- Post-payment helpers ------- */

/* Shows a success / error message when the payment is complete */
var orderComplete = function(clientSecret) {
  // Just for the purpose of the sample, show the PaymentIntent response object
  stripe.retrievePaymentIntent(clientSecret).then(function(result) {
    var paymentIntent = result.paymentIntent;
    var paymentIntentJson = JSON.stringify(paymentIntent, null, 2);

    document.querySelector(".sr-payment-form").classList.add("hidden");
    document.querySelector("pre").textContent = paymentIntentJson;

    document.querySelector(".sr-result").classList.remove("hidden");
    setTimeout(function() {
      document.querySelector(".sr-result").classList.add("expand");
    }, 200);

    changeLoadingState(false);
  });
};

var showError = function(errorMsgText) {
  changeLoadingState(false);
  var errorMsg = document.querySelector(".sr-field-error");
  errorMsg.textContent = errorMsgText;
  setTimeout(function() {
    errorMsg.textContent = "";
  }, 4000);
};

// Show a spinner on payment submission
var changeLoadingState = function(isLoading) {
  if (isLoading) {
    document.querySelector("button").disabled = true;
    document.querySelector("#spinner").classList.remove("hidden");
    document.querySelector("#button-text").classList.add("hidden");
  } else {
    document.querySelector("button").disabled = false;
    document.querySelector("#spinner").classList.add("hidden");
    document.querySelector("#button-text").classList.remove("hidden");
  }
};

/* ------- Account list ------- */

// Fetch 10 most recent accounts from the server. We'll display one of three states in the UI, depending on the
// accounts list; (1) if you haven't created any accounts, we'll re-direct you to the onboarding guide, (2) if none of
// of your accounts have charges enabled, we'll display instructions on how to finish the onboarding process, (3)
// otherwise, we'll display a payment form, as a customer might see it.
fetch("/recent-accounts", {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  })
  .then(response => response.json())
  .then(data => {
    document.querySelector(".spinner").classList.add("hidden");

    var accounts = data.accounts.data;

    // If there are no accounts, display a message pointing to an onboarding guide.
    if (!accounts.length) {
      document.querySelector("#no-accounts-section").classList.remove("hidden");
      return;
    }

    var enabledAccounts = accounts.filter((acct) => acct.charges_enabled);

    // If no accounts are enabled, display instructions on how to enable an account. In an actual
    // application, you should only surface Express dashboard links to your connected account owners,
    // not to their customers.
    if (!enabledAccounts.length) {
      var expressAccounts = accounts.filter((acct) => acct.type == 'express');
      var hasCustom = !!accounts.filter((acct) => acct.type == 'custom');
      var hasStandard = !!accounts.filter((acct) => acct.type == 'standard');

      var wrapper = document.querySelector("#disabled-accounts-section");
      var input = document.querySelector("#disabled-accounts-select");
      expressAccounts.forEach((acct) => {
        var element = document.createElement("option");
        element.setAttribute("value", acct.id);
        element.innerHTML = acct.email || acct.id;
        input.appendChild(element)
      });
      // Remove the hidden CSS class on one of the sections with instruction on how to finish onboarding
      // for a given account type.
      if (!!expressAccounts) {
        document.querySelector('#disabled-accounts-form').classList.remove("hidden");
        wrapper.querySelector('.express').classList.remove("hidden");
      }
      else if (hasCustom) {
        wrapper.querySelector('.custom').classList.remove("hidden");
      }
      else if (hasStandard) {
        wrapper.querySelector('.standard').classList.remove("hidden");
      }
      wrapper.classList.remove("hidden");
      return;
    } 

    // If at least one account is enabled, show the account selector and payment form.
    var wrapper = document.querySelector("#enabled-accounts-section");
    var input = document.querySelector("#enabled-accounts-select");
    enabledAccounts.forEach((acct) => {
      var element = document.createElement("option");
      element.setAttribute("value", acct.id);
      element.innerHTML = acct.email || acct.id;
      input.appendChild(element)
    });
    wrapper.classList.remove("hidden");
    updatePaymentIntent(input.value, true /* shouldSetupElement */);
    return;
  });


/* ------- Express dashboard ------- */

// When no accounts are enabled, this sample provides a way to log in as
// an Express account to finish the onboarding process. Here, we set up
// the event handler to construct the Express dashboard link.
expressDashboardForm = document.querySelector('#disabled-accounts-form');
expressDashboardForm.addEventListener(
  "submit",
  event => {
    event.preventDefault();
    button = expressDashboardForm.querySelector('button');
    button.setAttribute("disabled", "disabled");
    button.textContent = "Opening...";

    var url = new URL("/express-dashboard-link", document.baseURI);
    params = {account_id: document.querySelector("#disabled-accounts-select").value};
    url.search = new URLSearchParams(params).toString();

    fetch(url, {
      method: "GET",
      headers: {
      "Content-Type": "application/json"
      }
    })
      .then(response => response.json())
      .then(data => {
        if (data.url) {
          window.location = data.url;
        } else {
          elmButton.removeAttribute("disabled");
          elmButton.textContent = "<Something went wrong>";
          console.log("data", data);
        }
      });
  },
  false
);