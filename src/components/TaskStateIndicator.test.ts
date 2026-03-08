import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskStateIndicator } from "./TaskStateIndicator";

test("renders the current task state and the visible stepper", () => {
  const html = renderToStaticMarkup(React.createElement(TaskStateIndicator, { currentState: "validation" }));

  assert.match(html, /data-task-state="validation"/);
  assert.match(html, /Planning/);
  assert.match(html, /Execution/);
  assert.match(html, /Validation/);
  assert.match(html, /Completed/);
});
