import { action } from "../app/routes/api.customer-images.jsx";

async function run() {
  console.log("Simulating api/customer-images action...");
  
  // Construct a mock Request object
  const body = {
    shop: "orvella-dev-eoxgmvl0.myshopify.com",
    generationId: "cmq0y2qlf0004sx6wbscq6sdy",
    customerId: "undefined",
    customerEmail: "",
    finalSelections: {
      orientation: "square",
      size: "12x12",
      frame: "none",
      frameColor: "black",
      effect: "none",
    }
  };

  const req = new Request("http://localhost/api/customer-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  try {
    const res = await action({ request: req });
    console.log("Response status:", res.status);
    const data = await res.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Action threw an error:", err);
  }
}

run();
