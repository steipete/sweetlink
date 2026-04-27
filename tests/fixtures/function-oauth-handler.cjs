"use strict";
function authorize() {
  return { handled: true, action: "function-export" };
}

module.exports = authorize;
module.exports.authorize = authorize;
