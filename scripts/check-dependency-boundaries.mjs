import ts from "typescript";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXCEPTIONS = ["process-profile.ts", "omnigent-isolation-policy.ts", "types.ts"].map((name) => `packages/identity-isolation/src/${name}`);
const LOADER = "packages/core-contracts/src/coordination-contract.ts";
const shape = (node) => {
  if (!node) return null;
  const children = [];
  ts.forEachChild(node, (child) => { children.push(shape(child)); });
  return JSON.stringify([node.kind, node.text ?? null, children]);
};
const expectedLoader = ts.createSourceFile("expected.ts", 'export function loadCoordinationContractArtifact(path: string): unknown { return require(`@consiliency/contract/${path}`) as unknown; }', ts.ScriptTarget.Latest, true);
const expectedBindings = ts.createSourceFile("binding.ts", 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);', ts.ScriptTarget.Latest, true);
const expectedBinding = expectedBindings.statements.find(ts.isVariableStatement)?.declarationList.declarations[0];
export function checkBoundaries(root = process.cwd()) {
  root = realpathSync(root);
  const seen = new Set();
  let loaderCount = 0;
  const errors = [];
  const packages = readdirSync(resolve(root, "packages"));
  const owner = (path) => relative(root, realpathSync(path)).split("/").slice(0, 2).join("/");
  const fail = (file, reason) => errors.push(`${relative(root, file)}: ${reason}`);
  function walk(dir, visited = new Set()) {
    const real = realpathSync(dir);
    if (visited.has(real)) throw new Error("Source symlink cycle");
    visited.add(real);
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) return walk(path, new Set(visited));
      if (entry.isSymbolicLink() && !existsSync(path)) throw new Error("Unresolved symlink");
      return [path];
    });
  }
  for (const pkg of packages) {
    const dir = resolve(root, "packages", pkg);
    if (!existsSync(resolve(dir, "src"))) continue;
    const config = ts.readConfigFile(resolve(dir, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, dir);
    if (config.error || parsed.errors.length) throw new Error("Invalid source tsconfig");
    const manifest = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
    function inspectMappings(value, base) {
      if (typeof value === "string" && value.startsWith(".")) {
        const target = resolve(base, value.split("*")[0] ?? "");
        if (!target.startsWith(dir + "/")) fail(base, "Mapped source escape");
        if (existsSync(target) && owner(target) !== `packages/${pkg}`) fail(base, "Mapped symlink escape");
      } else if (value && typeof value === "object") for (const item of Object.values(value)) inspectMappings(item, base);
    }
    inspectMappings(manifest.imports, dir);
    for (const targets of Object.values(parsed.options.paths ?? {})) for (const target of targets) inspectMappings("./" + target, parsed.options.baseUrl ?? dir);
    const files = walk(resolve(dir, "src"));
    const program = ts.createProgram(files.filter((file) => file.endsWith(".ts")), parsed.options);
    const checker = program.getTypeChecker();
    function isCreateRequire(node) {
      if (ts.isParenthesizedExpression(node)) return isCreateRequire(node.expression);
      if (ts.isPropertyAccessExpression(node) && node.name.text === "createRequire") {
        const namespace = checker.getSymbolAtLocation(node.expression)?.declarations?.[0];
        if (namespace && (ts.isNamespaceImport(namespace) || ts.isImportClause(namespace))) {
          const module = ts.isNamespaceImport(namespace) ? namespace.parent.parent.moduleSpecifier : namespace.parent.moduleSpecifier;
          return ts.isStringLiteral(module) && ["node:module", "module"].includes(module.text);
        }
      }
      const declaration = checker.getSymbolAtLocation(node)?.declarations?.[0];
      return declaration && ts.isImportSpecifier(declaration) && (declaration.propertyName?.text ?? declaration.name.text) === "createRequire" && ts.isStringLiteral(declaration.parent.parent.parent.moduleSpecifier) && ["node:module", "module"].includes(declaration.parent.parent.parent.moduleSpecifier.text);
    }
    function isLoader(node, visited = new Set()) {
      if (ts.isParenthesizedExpression(node)) return isLoader(node.expression, visited);
      if (ts.isIdentifier(node) && node.text === "require") return true;
      const symbol = checker.getSymbolAtLocation(node);
      if (!symbol || visited.has(symbol)) return false;
      visited.add(symbol);
      const declaration = symbol.valueDeclaration;
      if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer) return false;
      const init = declaration.initializer;
      return (ts.isCallExpression(init) && isCreateRequire(init.expression)) || (ts.isIdentifier(init) && isLoader(init, visited));
    }
    for (const file of files) {
      if (owner(file) !== `packages/${pkg}`) { fail(file, "Source symlink escape"); continue; }
      if (extname(file) !== ".ts") { fail(file, "Unsupported source extension"); continue; }
      if (file.endsWith(".test.ts")) continue;
      const source = program.getSourceFile(file);
      if (!source) { fail(file, "Unparsed source"); continue; }
      const rel = relative(root, file);
      function specifier(value, node) {
        if (!value) { fail(file, "Unresolved loader form"); return; }
        const text = ts.isStringLiteralLike(value) ? value.text : undefined;
        if (text === undefined) {
          const fn = node.parent?.parent?.parent?.parent;
          const binding = checker.getSymbolAtLocation(node.expression)?.valueDeclaration;
          const createBinding = binding && ts.isVariableDeclaration(binding) && binding.initializer && ts.isCallExpression(binding.initializer) ? checker.getSymbolAtLocation(binding.initializer.expression)?.declarations?.[0] : undefined;
          const allowed = rel === LOADER && ts.isCallExpression(node) && node.arguments.length === 1 && ts.isFunctionDeclaration(fn) && fn.name?.text === "loadCoordinationContractArtifact" && shape(fn) === shape(expectedLoader.statements[0]) && binding && shape(binding) === shape(expectedBinding) && createBinding && ts.isImportSpecifier(createBinding) && shape(createBinding.parent.parent.parent) === shape(expectedBindings.statements[0]);
          if (allowed) loaderCount++; else fail(file, "Computed/unresolved module loader");
          return;
        }
        const resolved = ts.resolveModuleName(text, file, parsed.options, ts.sys).resolvedModule?.resolvedFileName;
        let target = resolved;
        if (!target && text.startsWith(".")) {
          const plain = resolve(dirname(file), text);
          target = [plain, plain.replace(/\.js$/, ".ts"), plain + ".ts"].find(existsSync);
        }
        if (!target) { if (text.startsWith(".") || text.startsWith("#") || text.startsWith("/")) fail(file, "Unresolved source import"); return; }
        const real = realpathSync(target);
        const targetRel = relative(root, real);
        if (targetRel.startsWith("packages/") && real.endsWith(".test.ts")) { fail(file, "Production import of test source"); return; }
        if (targetRel.startsWith("packages/")) {
          const targetPackage = JSON.parse(readFileSync(resolve(root, owner(real), "package.json"), "utf8"));
          if (text === targetPackage.name && targetPackage.exports?.["."]) return;
        }
        if (!targetRel.startsWith("packages/") || !targetRel.includes("/src/") || owner(real) === owner(file)) return;
        const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
        const names = clause?.namedBindings;
        const allowed = EXCEPTIONS.includes(rel) && text === "../../omnigent-transport/src/types.js" && clause?.isTypeOnly && !clause.name && names && ts.isNamedImports(names) && names.elements.length === 1 && names.elements[0]?.name.text === "OmnigentProviderMode" && !names.elements[0]?.propertyName && !seen.has(rel);
        if (allowed) seen.add(rel); else fail(file, "Cross-package source import");
      }
      for (const reference of source.referencedFiles) specifier(ts.factory.createStringLiteral(reference.fileName), source);
      function visit(node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) { if (node.moduleSpecifier) specifier(node.moduleSpecifier, node); }
        else if (ts.isImportEqualsDeclaration(node)) {
          if (ts.isExternalModuleReference(node.moduleReference)) specifier(node.moduleReference.expression, node); else fail(file, "Unsupported import-equals loader");
        } else if (ts.isImportTypeNode(node)) specifier(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument, node);
        else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || isLoader(node.expression))) specifier(node.arguments[0], node);
        else if (ts.isCallExpression(node) && ts.isCallExpression(node.expression) && isCreateRequire(node.expression.expression)) fail(file, "Unresolved module-loader form");
        else if (ts.isPropertyAccessExpression(node) && (node.name.text === "require" || (node.name.text === "resolve" && isLoader(node.expression)) || (node.name.text === "createRequire" && !(isCreateRequire(node) && ts.isCallExpression(node.parent) && node.parent.expression === node)))) fail(file, "Unsupported module-loader form");
        else if (ts.isBindingElement(node)) {
          const name = node.propertyName ?? node.name;
          if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === "createRequire") fail(file, "Unsupported createRequire destructuring");
        }
        else if (ts.isElementAccessExpression(node) && (isLoader(node.expression) || (ts.isStringLiteral(node.argumentExpression) && ["require", "createRequire"].includes(node.argumentExpression.text)))) fail(file, "Unsupported module-loader form");
        else if (ts.isIdentifier(node) && isCreateRequire(node) && !ts.isImportSpecifier(node.parent) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) fail(file, "Unresolved createRequire alias");
        else if (ts.isIdentifier(node) && isLoader(node) && !(ts.isVariableDeclaration(node.parent) && node.parent.name === node) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) fail(file, "Unresolved require binding usage");
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  for (const exception of EXCEPTIONS) if (!seen.has(exception)) errors.push(`Stale exception: ${exception}`);
  if (loaderCount !== 1) errors.push("Expected exactly one pinned contract loader");
  if (errors.length) throw new Error(errors.join("\n"));
  return { exceptions: seen.size, computedLoaders: loaderCount };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(checkBoundaries())); }
  catch (error) { console.error(error instanceof Error ? error.message : "Boundary failure"); process.exitCode = 1; }
}
