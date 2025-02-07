export function declare<
  Args extends
    | [any]
    | [any, any?]
    | [any, any?, any?]
    | [any, any]
    | [any, any, any?]
    | [any, any, any],
  Builder extends (...args: Args) => any,
>(
  builder: Builder,
  // todo(flow->ts) maybe add stricter type for returned function
  // reason any is there to not expose exact implementation details in type
  // example of issue with this packages/babel-preset-typescript/src/index.ts
): Builder extends (...args: infer A) => any ? (...args: A) => any : never {
  // @ts-ignore
  return (api, options, dirname) => {
    let clonedApi;

    for (const name of Object.keys(apiPolyfills)) {
      if (api[name]) continue;

      // TODO: Use ??= when flow lets us to do so
      clonedApi = clonedApi ?? copyApiObject(api);
      clonedApi[name] = apiPolyfills[name](clonedApi);
    }

    // @ts-ignore
    return builder(clonedApi ?? api, options || {}, dirname);
  };
}

const apiPolyfills = {
  // Not supported by Babel 7 and early versions of Babel 7 beta.
  // It's important that this is polyfilled for older Babel versions
  // since it's needed to report the version mismatch.
  assertVersion: api => range => {
    throwVersionError(range, api.version);
  },
  // This is supported starting from Babel 7.13
  // TODO(Babel 8): Remove this polyfill
  targets: () => () => {
    return {};
  },
  // This is supported starting from Babel 7.13
  // TODO(Babel 8): Remove this polyfill
  assumption: () => () => {},
};

function copyApiObject(api) {
  // Babel >= 7 <= beta.41 passed the API as a new object that had
  // babel/core as the prototype. While slightly faster, it also
  // means that the Object.assign copy below fails. Rather than
  // keep complexity, the Babel 6 behavior has been reverted and this
  // normalizes all that for Babel 7.
  let proto = null;
  if (typeof api.version === "string" && /^7\./.test(api.version)) {
    proto = Object.getPrototypeOf(api);
    if (
      proto &&
      (!has(proto, "version") ||
        !has(proto, "transform") ||
        !has(proto, "template") ||
        !has(proto, "types"))
    ) {
      proto = null;
    }
  }

  return {
    ...proto,
    ...api,
  };
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function throwVersionError(range, version) {
  if (typeof range === "number") {
    if (!Number.isInteger(range)) {
      throw new Error("Expected string or integer value.");
    }
    range = `^${range}.0.0-0`;
  }
  if (typeof range !== "string") {
    throw new Error("Expected string or integer value.");
  }

  const limit = Error.stackTraceLimit;

  if (typeof limit === "number" && limit < 25) {
    // Bump up the limit if needed so that users are more likely
    // to be able to see what is calling Babel.
    Error.stackTraceLimit = 25;
  }

  let err;
  if (version.slice(0, 2) === "7.") {
    err = new Error(
      `Requires Babel "^7.0.0-beta.41", but was loaded with "${version}". ` +
        `You'll need to update your @babel/core version.`,
    );
  } else {
    err = new Error(
      `Requires Babel "${range}", but was loaded with "${version}". ` +
        `If you are sure you have a compatible version of @babel/core, ` +
        `it is likely that something in your build process is loading the ` +
        `wrong version. Inspect the stack trace of this error to look for ` +
        `the first entry that doesn't mention "@babel/core" or "babel-core" ` +
        `to see what is calling Babel.`,
    );
  }

  if (typeof limit === "number") {
    Error.stackTraceLimit = limit;
  }

  throw Object.assign(err, {
    code: "BABEL_VERSION_UNSUPPORTED",
    version,
    range,
  } as any);
}
