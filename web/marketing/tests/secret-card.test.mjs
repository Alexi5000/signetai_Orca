import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../public/redesign-home-mockup.html", import.meta.url), "utf8");
const start = html.indexOf("// ── Secrets view:");
const end = html.indexOf("// ── Skills view:", start);
assert.ok(start >= 0 && end > start);

function page() {
	const elements = new Map();
	const copied = [];
	const getElementById = (id) => {
		if (!elements.has(id)) {
			elements.set(id, {
				value: "",
				innerHTML: "",
				textContent: "",
				listeners: {},
				classList: { add() {}, remove() {} },
				focus() {},
				addEventListener(type, callback) {
					this.listeners[type] = callback;
				},
			});
		}
		return elements.get(id);
	};
	vm.runInNewContext(html.slice(start, end), {
		document: { getElementById },
		navigator: {
			clipboard: {
				writeText(value) {
					copied.push(value);
					return Promise.resolve();
				},
			},
		},
		setTimeout(callback) {
			callback();
		},
	});
	return { get: getElementById, copied };
}

test("new secret names remain literal text in labels, attributes and formatted references", () => {
	const view = page();
	const name = "\"><img src=x onerror=&#97;&#108;&#101;&#114;&#116;(1)> & 'quoted'";
	view.get("sec-field-name").value = name;
	view.get("sec-modal-save").listeners.click();
	const markup = view.get("sec-grid").innerHTML;
	const escaped =
		"&quot;&gt;&lt;IMG SRC=X ONERROR=&amp;#97;&amp;#108;&amp;#101;&amp;#114;&amp;#116;(1)&gt; &amp; &#39;QUOTED&#39;";
	assert.ok(markup.includes(`data-name="${escaped}"`));
	assert.ok(markup.includes(`<div class="sec-card__name">${escaped}</div>`));
	assert.ok(markup.includes(`<b>$secret:${escaped}</b> · new`));
	assert.equal(/<img/i.test(markup), false);
	assert.ok(markup.includes("<b>$secret:OPENAI_API_KEY</b> · inference"));
	assert.equal(view.get("sec-field-name").value, "");
});

test("copy and delete use the original normalized name", () => {
	const view = page();
	view.get("sec-field-name").value = "test & example";
	view.get("sec-modal-save").listeners.click();
	const card = { dataset: { name: "TEST & EXAMPLE" }, style: {} };
	const action = { dataset: { act: "copyref" }, style: {}, closest: () => card };
	const event = { target: { closest: () => action } };
	view.get("sec-grid").listeners.click(event);
	assert.deepEqual(view.copied, ["$secret:TEST & EXAMPLE"]);
	action.dataset.act = "delete";
	view.get("sec-grid").listeners.click(event);
	assert.equal(view.get("sec-grid").innerHTML.includes("TEST &amp; EXAMPLE"), false);
});
