import type * as d from '../../declarations';
import { getTsOptionsToExtend } from './ts-config';
import { GENERATED_DTS } from '../output-targets/output-utils';
import ts from 'typescript';

/**
 *
 * @param config
 * @param buildCallback
 * @returns
 */
export const createTsBuildProgram = async (
  config: d.Config,
  buildCallback: (tsBuilder: ts.BuilderProgram) => Promise<void>
) => {
  console.trace(`src/compiler/transpile/create-build-program.ts#createTsBuildProgram() - init`);
  let isRunning = false;
  let timeoutId: any;

  const optionsToExtend = getTsOptionsToExtend(config);

  const tsWatchSys: ts.System = {
    ...ts.sys,

    watchFile(path, callback) {
      if (path.endsWith(`/${GENERATED_DTS}`)) {
        // potentially 2 watches being created?
        console.trace(`src/compiler/transpile/create-build-program.ts#createTsBuildProgram()#watchFile(path) - ${path}`);
        return ts.sys.watchFile(path, callback);
      }
      return {
        close() {},
      };
    },
    watchDirectory() {
      return {
        close() {},
      };
    },
    setTimeout(callback: (...args: any[]) => void , watchTimeoutMs: number) {
      timeoutId = setInterval(() => {
        if (!isRunning) {
          console.log(`src/compiler/transpile/create-build-program.ts#setTimeout - isRunning: false`)
          callback();
          clearInterval(timeoutId);
        } else {
          console.log(`src/compiler/transpile/create-build-program.ts#setTimeout - isRunning: true`)
        }
      }, config.sys.watchTimeout || watchTimeoutMs); // TODO: Probably a bug if config.sys.watchTimeout is 0
      // confirmed that this is being set 1x, even when we repro
      console.log(`src/compiler/transpile/create-build-program.ts#setTimeout - timeoutId ${timeoutId}`);
      return timeoutId;
    },

    clearTimeout(id) {
      // stack traces for each of these 2x calls are exactly the same
      // Trace: src/compiler/transpile/create-build-program.ts#setTimeout - clearTimeout: 9211
      // at Object.clearTimeout (/sandbox/ionic-framework/core/node_modules/@stencil/core/compiler/stencil.js:62519:15)
      // at /sandbox/ionic-framework/core/node_modules/@stencil/core/compiler/stencil.js:62523:42
      // at /sandbox/ionic-framework/core/node_modules/@stencil/core/sys/node/index.js:5752:16
      // at Set.forEach (<anonymous>)
      // at Object.destroy (/sandbox/ionic-framework/core/node_modules/@stencil/core/sys/node/index.js:5750:6)
      // at Object.destroy (/sandbox/ionic-framework/core/node_modules/@stencil/core/compiler/stencil.js:63743:15)
      // at taskBuild (/sandbox/ionic-framework/core/node_modules/@stencil/core/cli/index.cjs:1273:24)
      // at async runTask (/sandbox/ionic-framework/core/node_modules/@stencil/core/cli/index.cjs:1797:13)
      // at async /sandbox/ionic-framework/core/node_modules/@stencil/core/cli/index.cjs:1781:13
      // at async telemetryAction (/sandbox/ionic-framework/core/node_modules/@stencil/core/cli/index.cjs:1012:13)
      console.trace(`src/compiler/transpile/create-build-program.ts#setTimeout - clearTimeout: ` + id)
      return clearInterval(id);
    },
  };

  config.sys.addDestory(() => tsWatchSys.clearTimeout(timeoutId));

  const tsWatchHost: ts.WatchCompilerHostOfConfigFile<ts.EmitAndSemanticDiagnosticsBuilderProgram> = ts.createWatchCompilerHost(
    config.tsconfig,
    optionsToExtend,
    tsWatchSys,
    ts.createEmitAndSemanticDiagnosticsBuilderProgram,
    (reportDiagnostic) => {
      config.logger.debug('watch reportDiagnostic:' + reportDiagnostic.messageText);
    },
    (reportWatchStatus) => {
      config.logger.debug('watch reportWatchStatus:' + reportWatchStatus.messageText);
    }
  );

  const id1 = Math.ceil(Math.random() * 1_000_000);
  tsWatchHost.afterProgramCreate = async (tsBuilder: ts.EmitAndSemanticDiagnosticsBuilderProgram) => {
    const id2 = Math.ceil(Math.random() * 1_000_000);
    console.trace(`src/compiler/transpile/create-build-program.ts#afterProgramCreate id1: ${id1}, id2: ${id2}- setting isRunning: true (was ${isRunning})`)
    isRunning = true;
    console.trace('src/compiler/transpile/create-build-program.ts#afterProgramCreate', id1, id2)
    await buildCallback(tsBuilder);
    console.trace(`src/compiler/transpile/create-build-program.ts#afterProgramCreate id1: ${id1}, id2: ${id2}- setting isRunning: false (was ${isRunning})`)
    isRunning = false;
    console.trace('src/compiler/transpile/create-build-program.ts#afterProgramCreate - COMPLETE', id1, id2)
  };
  console.trace('src/compiler/transpile/create-build-program.ts#createWatchProgram', id1)
  return ts.createWatchProgram(tsWatchHost);
};
