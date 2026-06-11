const assert = require("node:assert/strict");
const test = require("node:test");

const { formatApaThesisTitle } = require("../dist/utils/thesis_title.js");

test("formats an uppercase thesis title and preserves a geographic name", () => {
  assert.equal(
    formatApaThesisTitle(
      "THE IMPACT OF BULLYING: A CASE STUDY AT SANTO TOMAS, DAVAO DEL NORTE",
    ),
    "The Impact of Bullying: A Case Study at Santo Tomas, Davao del Norte",
  );
});

test("lowercases APA minor words", () => {
  assert.equal(
    formatApaThesisTitle("an analysis of teaching and learning in schools"),
    "An Analysis of Teaching and Learning in Schools",
  );
});

test("capitalizes the first word after a subtitle separator", () => {
  assert.equal(
    formatApaThesisTitle("from data to decisions: the role of ai"),
    "From Data to Decisions: The Role of AI",
  );
});

test("preserves configured acronyms and intentional mixed case", () => {
  assert.equal(
    formatApaThesisTitle("the use of AI in eHealth systems"),
    "The Use of AI in eHealth Systems",
  );
});

test("trims and collapses repeated whitespace", () => {
  assert.equal(
    formatApaThesisTitle("  effects   of covid-19 on ict students  "),
    "Effects of COVID-19 on ICT Students",
  );
});

test("keeps minor words lowercase inside hyphenated compounds", () => {
  assert.equal(
    formatApaThesisTitle("a state-of-the-art learning system"),
    "A State-of-the-Art Learning System",
  );
});
