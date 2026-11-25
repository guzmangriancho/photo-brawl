// Loads the real src/engine/cpuTactics.ts for tests that run FightEngine.ts in a vm.
const fs=require('fs'),path=require('path'),ts=require('typescript'),vm=require('vm');
const file=path.join(__dirname,'../../src/engine/cpuTactics.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,Math,Number});
module.exports=mod.exports;
