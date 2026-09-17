import test from "node:test";
import assert from "node:assert/strict";
import { createSheets } from "../src/google/sheets.js";
import { createAuth } from "../src/google/auth.js";

const HEADER = [
  "id",
  "record_id",
  "parents_json",
  "created_at",
  "deleted",
  "date",
  "exercise_id",
  "data_json",
];
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function transport(replies) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), ...options });
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      assert.ok(reply, "unexpected extra network call");
      return reply;
    },
  };
}
function remote(
  training = [],
  inbody = [],
  meta = [
    ["key", "value"],
    ["app", "rehab-log"],
    ["schemaVersion", "1"],
  ],
) {
  return {
    spreadsheetId: "sheet-1",
    valueRanges: [
      { range: "'_meta'!A1:B3", majorDimension: "ROWS", values: meta },
      {
        range: "'training_log'!A1:H1000",
        majorDimension: "ROWS",
        values: [HEADER, ...training],
      },
      {
        range: "'inbody'!A1:H1000",
        majorDimension: "ROWS",
        values: [HEADER, ...inbody],
      },
    ],
  };
}

const TRAINING = {
  schemaVersion: 1,
  id: "v1",
  recordId: "r1",
  parents: [],
  kind: "training",
  createdAt: "2026-09-15T00:00:00.000Z",
  deleted: false,
  data: {
    date: "2026-09-15",
    exerciseId: "chest_press",
    machine: "gym-a",
    unit: "lb",
    sets: [{ load: 65, reps: 12 }],
    pain: "none",
    technique: "stable",
    note: '=IMPORTXML("https://example.com", "//x")',
  },
};
const BODY = {
  schemaVersion: 1,
  id: "v2",
  recordId: "r2",
  parents: [],
  kind: "inbody",
  createdAt: "2026-09-15T01:00:00.000Z",
  deleted: false,
  data: {
    date: "2026-09-15",
    metrics: {
      weight: 70,
      skeletal_muscle_mass: null,
      body_fat_mass: null,
      body_fat_percentage: null,
      fat_free_mass: null,
      bmi: null,
      visceral_fat_level: null,
      segmental_left_arm: null,
      segmental_right_arm: null,
      segmental_left_leg: null,
      segmental_right_leg: null,
      segmental_trunk: null,
    },
    note: "",
  },
};
const TRAINING_ROW = [
  "v1",
  "r1",
  "[]",
  "2026-09-15T00:00:00.000Z",
  "false",
  "2026-09-15",
  "chest_press",
  JSON.stringify(TRAINING.data),
];
const BODY_ROW = [
  "v2",
  "r2",
  "[]",
  "2026-09-15T01:00:00.000Z",
  "false",
  "2026-09-15",
  "",
  JSON.stringify(BODY.data),
];

test("read parses both kinds, preserves revision identity and deduplicates identical rows", async () => {
  const io = transport([
    response(remote([TRAINING_ROW, TRAINING_ROW], [BODY_ROW])),
  ]);
  const events = await createSheets({
    getToken: () => "token",
    fetchImpl: io.fetchImpl,
  }).read("sheet-1");
  assert.deepEqual(
    events.find((event) => event.kind === "training"),
    TRAINING,
  );
  assert.deepEqual(
    events.find((event) => event.kind === "inbody"),
    BODY,
  );
  assert.equal(events.length, 2);
});

test("measurement context and optional fields survive Sheets read and RAW append unchanged", async () => {
  const data = {...BODY.data, time:"08:05", measurementContext:{device:"A 館",conditions:"原始量測條件"},metrics:{...BODY.data.metrics,segmental_right_arm_pct:99.1,segmental_trunk_pct:101.2}};
  const row = [...BODY_ROW];
  row[7] = JSON.stringify(data);
  const io = transport([
    response(remote([], [row])),
    response({spreadsheetId:"sheet-1",tableRange:"inbody!A1:H1",updates:{spreadsheetId:"sheet-1",updatedRange:"inbody!A2:H2",updatedRows:1,updatedColumns:8,updatedCells:8}}),
  ]);
  const sheets = createSheets({getToken:()=>"test-token",fetchImpl:io.fetchImpl});
  const events = await sheets.read("sheet-1");
  assert.deepEqual(events[0].data,data);
  await sheets.append("sheet-1",events);
  const written = JSON.parse(io.calls[1].body).values[0];
  assert.deepEqual(JSON.parse(written[7]),data);
});

test("read rejects mismatched projected cells, invalid data and reused ID with different content", async () => {
  const mismatch = [...TRAINING_ROW];
  mismatch[5] = "2026-09-14";
  const invalid = [...TRAINING_ROW];
  invalid[7] = JSON.stringify({ ...TRAINING.data, unit: "bogus" });
  const reused = [...TRAINING_ROW];
  reused[7] = JSON.stringify({ ...TRAINING.data, note: "different" });
  for (const rows of [[mismatch], [invalid], [TRAINING_ROW, reused]]) {
    const io = transport([response(remote(rows))]);
    await assert.rejects(
      createSheets({ getToken: () => "token", fetchImpl: io.fetchImpl }).read(
        "sheet-1",
      ),
      (error) => error.code === "remote-format",
    );
  }
});

test("append emits RAW INSERT_ROWS separately per kind, preserving formula-like text as data", async () => {
  const io = transport([
    response({
      spreadsheetId: "sheet-1",
      tableRange: "training_log!A1:H1",
      updates: {
        spreadsheetId: "sheet-1",
        updatedRange: "training_log!A2:H2",
        updatedRows: 1,
        updatedColumns: 8,
        updatedCells: 8,
      },
    }),
    response({
      spreadsheetId: "sheet-1",
      tableRange: "inbody!A1:H1",
      updates: {
        spreadsheetId: "sheet-1",
        updatedRange: "inbody!A2:H2",
        updatedRows: 1,
        updatedColumns: 8,
        updatedCells: 8,
      },
    }),
  ]);
  await createSheets({
    getToken: () => "token",
    fetchImpl: io.fetchImpl,
  }).append("sheet-1", [TRAINING, BODY]);
  assert.equal(io.calls.length, 2);
  for (const call of io.calls) {
    assert.equal(call.method, "POST");
    assert.equal(call.url.searchParams.get("valueInputOption"), "RAW");
    assert.equal(call.url.searchParams.get("insertDataOption"), "INSERT_ROWS");
    assert.equal(JSON.parse(call.body).majorDimension, "ROWS");
  }
  assert.equal(
    decodeURIComponent(io.calls[0].url.pathname),
    "/v4/spreadsheets/sheet-1/values/'training_log'!A:H:append",
  );
  assert.deepEqual(JSON.parse(io.calls[0].body).values, [TRAINING_ROW]);
  assert.deepEqual(JSON.parse(io.calls[1].body).values, [BODY_ROW]);
});

test("ambiguous append network failure is surfaced once; invalid events never reach network", async () => {
  const io = transport([new TypeError("secret network details")]);
  const sheets = createSheets({
    getToken: () => "token",
    fetchImpl: io.fetchImpl,
  });
  await assert.rejects(
    sheets.append("sheet-1", [TRAINING]),
    (error) => error.code === "network" && !error.message.includes("secret"),
  );
  assert.equal(io.calls.length, 1);
  const offline = transport([]);
  await assert.rejects(
    createSheets({
      getToken: () => "token",
      fetchImpl: offline.fetchImpl,
    }).append("sheet-1", [{ ...TRAINING, kind: "unknown" }]),
  );
  assert.equal(offline.calls.length, 0);
});

test("append accepts a pending child whose parent already exists remotely and encodes tombstones", async () => {
  const deleted = {
    schemaVersion: 1,
    id: "v3",
    recordId: "r1",
    parents: ["v1"],
    kind: "training",
    createdAt: "2026-09-15T02:00:00.000Z",
    deleted: true,
    data: null,
  };
  const io = transport([
    response({
      spreadsheetId: "sheet-1",
      tableRange: "training_log!A1:H2",
      updates: {
        spreadsheetId: "sheet-1",
        updatedRange: "training_log!A3:H3",
        updatedRows: 1,
        updatedColumns: 8,
        updatedCells: 8,
      },
    }),
  ]);
  await createSheets({
    getToken: () => "token",
    fetchImpl: io.fetchImpl,
  }).append("sheet-1", [deleted]);
  assert.deepEqual(JSON.parse(io.calls[0].body).values, [
    ["v3", "r1", '["v1"]', "2026-09-15T02:00:00.000Z", "true", "", "", "null"],
  ]);
});

test("append batches long journals without dropping the final partial batch", async () => {
  const events = Array.from({ length: 101 }, (_, index) => ({
    ...TRAINING,
    id: `v${index}`,
    recordId: `r${index}`,
  }));
  const io = transport([
    response({ spreadsheetId: "sheet-1", updates: { updatedRows: 100 } }),
    response({ spreadsheetId: "sheet-1", updates: { updatedRows: 1 } }),
  ]);
  await createSheets({
    getToken: () => "token",
    fetchImpl: io.fetchImpl,
  }).append("sheet-1", events);
  assert.deepEqual(
    io.calls.map((call) => JSON.parse(call.body).values.length),
    [100, 1],
  );
  assert.equal(JSON.parse(io.calls[1].body).values[0][0], "v100");
});

test("create initializes all four tabs and journal headers in one POST", async () => {
  const io = transport([
    response({
      spreadsheetId: "sheet-1",
      properties: { title: "個人訓練紀錄" },
    }),
  ]);
  const sheets = createSheets({
    getToken: () => "test-token",
    fetchImpl: io.fetchImpl,
  });
  assert.deepEqual(await sheets.create(), {
    id: "sheet-1",
    name: "個人訓練紀錄",
  });
  assert.equal(io.calls.length, 1);
  const call = io.calls[0];
  assert.equal(call.url.href, "https://sheets.googleapis.com/v4/spreadsheets");
  assert.equal(call.method, "POST");
  assert.equal(call.headers.Authorization, "Bearer test-token");
  const body = JSON.parse(call.body);
  assert.deepEqual(
    body.sheets.map((s) => s.properties.title),
    ["_meta", "training_log", "inbody", "exercise_catalog"],
  );
  const rows = (s) =>
    s.data[0].rowData.map((row) =>
      row.values.map((c) => c.userEnteredValue.stringValue),
    );
  assert.deepEqual(rows(body.sheets[0]), [
    ["key", "value"],
    ["app", "rehab-log"],
    ["schemaVersion", "1"],
  ]);
  assert.deepEqual(rows(body.sheets[1]), [HEADER]);
  assert.deepEqual(rows(body.sheets[2]), [HEADER]);
  assert.ok(rows(body.sheets[3]).length > 1);
});

test("Drive listing follows nextPageToken and limits its query to nontrashed spreadsheets", async () => {
  const io = transport([
    response({
      kind: "drive#fileList",
      incompleteSearch: false,
      nextPageToken: "page-two",
      files: [{ id: "one", name: "A" }],
    }),
    response({
      kind: "drive#fileList",
      incompleteSearch: false,
      files: [{ id: "two", name: "B" }],
    }),
  ]);
  assert.deepEqual(
    await createSheets({
      getToken: () => "token",
      fetchImpl: io.fetchImpl,
    }).list(),
    [
      { id: "one", name: "A" },
      { id: "two", name: "B" },
    ],
  );
  assert.equal(io.calls[0].url.origin, "https://www.googleapis.com");
  assert.equal(
    io.calls[0].url.searchParams.get("q"),
    "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
  );
  assert.equal(io.calls[1].url.searchParams.get("pageToken"), "page-two");
});

test("empty initialized spreadsheet reads as an empty journal", async () => {
  const io = transport([response(remote())]);
  assert.deepEqual(
    await createSheets({
      getToken: () => "token",
      fetchImpl: io.fetchImpl,
    }).read("sheet-1"),
    [],
  );
  assert.equal(
    io.calls[0].url.pathname,
    "/v4/spreadsheets/sheet-1/values:batchGet",
  );
  assert.deepEqual(io.calls[0].url.searchParams.getAll("ranges"), [
    "'_meta'!A:B",
    "'training_log'!A:H",
    "'inbody'!A:H",
  ]);
  assert.equal(
    io.calls[0].url.searchParams.get("valueRenderOption"),
    "UNFORMATTED_VALUE",
  );
});

test("read rejects damaged metadata, headers, invalid JSON and incomplete rows", async () => {
  const badHeader = remote();
  badHeader.valueRanges[1].values = [["date"]];
  const variants = [
    remote(
      [],
      [],
      [
        ["key", "value"],
        ["app", "other"],
        ["schemaVersion", "1"],
      ],
    ),
    remote(
      [],
      [],
      [
        ["key", "value"],
        ["app", "rehab-log"],
        ["schemaVersion", "3"],
      ],
    ),
    badHeader,
    remote([
      [
        "v1",
        "r1",
        "{broken",
        "2026-09-15T00:00:00.000Z",
        "false",
        "2026-09-15",
        "leg_press",
        "{}",
      ],
    ]),
    remote([["v1"]]),
  ];
  for (const value of variants) {
    const io = transport([response(value)]);
    await assert.rejects(
      createSheets({ getToken: () => "token", fetchImpl: io.fetchImpl }).read(
        "sheet-1",
      ),
      (error) => error.code === "remote-format",
    );
  }
});

test("HTTP failures classify 401 and 429 without leaking body or retrying writes", async () => {
  for (const [status, code] of [
    [401, "auth"],
    [429, "rate-limit"],
    [503, "remote"],
  ]) {
    const io = transport([
      response({ error: { message: "PRIVATE_HEALTH_RESPONSE" } }, status),
    ]);
    await assert.rejects(
      createSheets({
        getToken: () => "test-token",
        fetchImpl: io.fetchImpl,
      }).create(),
      (error) =>
        error.code === code &&
        !error.message.includes("PRIVATE") &&
        !error.message.includes("test-token"),
    );
    assert.equal(io.calls.length, 1);
  }
});

const CLIENT = "test-client.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
function identity() {
  const configs = [];
  let requests = 0;
  const google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          configs.push(config);
          return {
            requestAccessToken() {
              requests++;
            },
          };
        },
      },
    },
  };
  return {
    configs,
    google,
    get requests() {
      return requests;
    },
  };
}

test("auth stays local until prepare; connect triggers popup synchronously with only drive.file", async () => {
  const gis = identity();
  let now = 100;
  const auth = createAuth({ getGoogle: () => gis.google, now: () => now });
  assert.equal(gis.requests, 0);
  assert.equal(auth.isConnected(), false);
  assert.throws(
    () => auth.token(),
    (error) => error.code === "auth",
  );
  await auth.prepare(CLIENT);
  const pending = auth.connect(CLIENT);
  assert.equal(
    gis.requests,
    1,
    "popup must start before yielding the click event",
  );
  assert.equal(gis.configs[0].scope, SCOPE);
  assert.equal(gis.configs[0].include_granted_scopes, false);
  gis.configs[0].callback({
    access_token: "RAM_TOKEN",
    expires_in: 3600,
    scope: SCOPE,
    token_type: "Bearer",
  });
  await pending;
  assert.equal(auth.token(), "RAM_TOKEN");
  now += 3600 * 1000;
  assert.equal(auth.isConnected(), false);
  assert.throws(
    () => auth.token(),
    (error) => error.code === "auth",
  );
});

test("auth rejects closed/blocked popups and declined scopes; disconnect ignores late callback", async () => {
  for (const type of ["popup_closed", "popup_failed_to_open"]) {
    const gis = identity();
    const auth = createAuth({ getGoogle: () => gis.google });
    await auth.prepare(CLIENT);
    const pending = auth.connect(CLIENT);
    gis.configs[0].error_callback({ type });
    await assert.rejects(pending, (error) => error.code === "auth");
    assert.equal(auth.isConnected(), false);
  }
  const gis = identity();
  const auth = createAuth({ getGoogle: () => gis.google });
  await auth.prepare(CLIENT);
  const refused = auth.connect(CLIENT);
  gis.configs[0].callback({
    access_token: "secret",
    expires_in: 3600,
    scope: "openid",
  });
  await assert.rejects(refused, (error) => error.code === "auth");
  const pending = auth.connect(CLIENT);
  auth.disconnect();
  await assert.rejects(pending, (error) => error.code === "auth");
  gis.configs[1].callback({
    access_token: "late-secret",
    expires_in: 3600,
    scope: SCOPE,
  });
  assert.equal(auth.isConnected(), false);
});

test("auth request timeout settles without accepting a late token", async () => {
  const gis = identity();
  const auth = createAuth({ getGoogle: () => gis.google, timeoutMs: 5 });
  await auth.prepare(CLIENT);
  await assert.rejects(auth.connect(CLIENT), (error) => error.code === "auth");
  gis.configs[0].callback({
    access_token: "late-secret",
    expires_in: 3600,
    scope: SCOPE,
  });
  assert.equal(auth.isConnected(), false);
});

test("GIS script is loaded only on prepare and a load failure permits a fresh attempt", async () => {
  let google;
  const scripts = [];
  const documentImpl = {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild(script) {
        scripts.push(script);
      },
    },
  };
  const auth = createAuth({ documentImpl, getGoogle: () => google });
  assert.equal(scripts.length, 0);
  await assert.rejects(auth.connect(CLIENT), (error) => error.code === "auth");
  assert.equal(scripts.length, 0);
  const first = auth.prepare(CLIENT);
  assert.equal(scripts[0].src, "https://accounts.google.com/gsi/client");
  scripts[0].onerror();
  await assert.rejects(first, (error) => error.code === "auth");
  const second = auth.prepare(CLIENT);
  google = identity().google;
  scripts[1].onload();
  await second;
  assert.equal(scripts.length, 2);
});

test("malformed GIS scope rejects authorization instead of throwing from its callback", async () => {
  const gis = identity();
  const auth = createAuth({ getGoogle: () => gis.google });
  await auth.prepare(CLIENT);
  const pending = auth.connect(CLIENT);
  const rejection = assert.rejects(pending, (error) => error.code === "auth");
  try {
    assert.doesNotThrow(() =>
      gis.configs[0].callback({
        access_token: "secret",
        expires_in: 3600,
        scope: 42,
      }),
    );
    await rejection;
  } finally {
    auth.disconnect();
    await rejection;
  }
});
