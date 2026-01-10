const https = require("https");

function testRegistration() {
  const postData = JSON.stringify({
    name: "Test Direct Curl",
    email: "test-direct-curl@example.com",
    password: "TestPassword123!"
  });

  const options = {
    hostname: "restoreassist.app",
    port: 443,
    path: "/api/auth/register",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = "";

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      console.log("=== Registration API Response ===");
      console.log(`Status Code: ${res.statusCode}`);
      console.log(`Status Message: ${res.statusMessage}`);
      console.log("\nHeaders:");
      console.log(res.headers);
      console.log("\nBody:");
      try {
        console.log(JSON.stringify(JSON.parse(data), null, 2));
      } catch (e) {
        console.log(data);
      }
    });
  });

  req.on("error", (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

testRegistration();
