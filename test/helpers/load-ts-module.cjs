const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

module.exports = (file, mocks = {}) => {
  const filename = path.resolve(__dirname, '../..', file)
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded.require = request => Object.hasOwn(mocks, request) ? mocks[request] : Module.prototype.require.call(loaded, request)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
  }).outputText
  loaded._compile(code, filename)
  return loaded.exports
}
