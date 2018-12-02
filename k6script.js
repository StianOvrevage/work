/*
Run locally:
  AZ_TOKEN=$(az account get-access-token | jq -r .accessToken)
  k6 run - --vus 1 --duration 600s --out influxdb=https://user:pass@radixinfluxdb.azurewebsites.net/influxdb < k6script.js
*/

const serviceAccountToken = `${__ENV.AZ_TOKEN}`

import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import http from "k6/http";

const criticalPass = new Counter("critical_tests_pass");
const criticalFail = new Counter("critical_tests_fail");
const warningPass = new Rate("warning_tests_pass");
const warningFail = new Rate("warning_tests_fail");

export let options = {
  thresholds: {
    "critical_tests_fail": ["count<1"],
    "warning_tests_fail": ["rate<0.1"],
  }
};

export default function() {

    // Array containing all tests
    let tests = []

    // Object containing one test
    let test = {}
    
    // This block will be templated by Helm
    test.expect = 200
    test.service = "grafana"
    test.endpoint = "https://grafana.dev.radix.equinor.com/login"
    test.authenticate = false
    tests.push(JSON.parse(JSON.stringify(test))); // Deep-ish copy
    test.expect = 200
    test.service = "api"
    test.endpoint = "https://api.dev.radix.equinor.com/api/v1/applications/radix-web-console"
    test.authenticate = true
    tests.push(JSON.parse(JSON.stringify(test))); // Deep-ish copy
    test.expect = 200
    test.service = "canary"
    test.endpoint = "https://canary.dev.radix.equinor.com/"
    test.authenticate = false
    tests.push(JSON.parse(JSON.stringify(test))); // Deep-ish copy
    test.expect = 500
    test.service = "webhook"
    test.endpoint = "https://webhook.dev.radix.equinor.com/"
    test.authenticate = false
    tests.push(JSON.parse(JSON.stringify(test))); // Deep-ish copy
    test.expect = 200
    test.service = "console"
    test.endpoint = "https://console.dev.radix.equinor.com/"
    test.authenticate = false
    tests.push(JSON.parse(JSON.stringify(test))); // Deep-ish copy
    test.expect = 200
    test.service = "www"
    test.endpoint = "https://www.dev.radix.equinor.com/"
    test.authenticate = false
    tests.push(JSON.parse(JSON.stringify(test))); // Deep-ish copy

    for (let i = 0; i < tests.length; i++) {

      let tags = {"name": tests[i].endpoint, "service": tests[i].service};
      
      // We add 1 critical error. If it is 0 nothing is sent to InfluxDB. Grafana will need to subtract 1 from the total.
      criticalFail.add(1, tags);

      let params = { tags: tags }

      if (tests[i].authenticate == true) {
        params = {
            tags: tags,
            headers: { 
                "Content-Type": "application/json",
                "Authorization": "Bearer " + serviceAccountToken
            }
        };
      }

      let res = http.get(tests[i].endpoint, params);
      
      // console.log(JSON.stringify(res, null, 4));
  
      if (check(res, {
        "no errors": (r) => r.error === ""
      }, tags)){
        criticalPass.add(1, tags);
      }else{
        console.log(res.error)
        criticalFail.add(1, tags);
      }
      
      if (check(res, {
        "expected HTTP status": (r) => r.status === tests[i].expect
      }, tags)){
        criticalPass.add(1, tags);
      }else{
        console.log("Unexpected HTTP status, wanted " + tests[i].expect + " but got " + res.status)
        criticalFail.add(1, tags);
      }

    }

    sleep(4);

}
