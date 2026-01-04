import { Command } from 'commander';
import { ShellPlugin } from '../plugins/ShellPlugin.js';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class ShellAdapter implements CliPluginAdapter {
    constructor(public plugin: ShellPlugin) {}

    registerOptions(program: Command) {
        program.option('--verify-command <cmd>', 'Shell command to verify output');
        program.option('--command <cmd>', 'Shell command to run after generation');
        program.option('--skip-candidate-command', 'Skip commands for candidates');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const registerStep = (flags: string, desc: string, parser?: any) => {
            const stepFlags = flags.replace(/^(--[\w-]+)/, `$1-${stepIndex}`);
            program.option(stepFlags, `${desc} for step ${stepIndex}`, parser);
        };

        registerStep('--verify-command <cmd>', 'Verify command');
        registerStep('--command <cmd>', 'Post-process command');
        registerStep('--skip-candidate-command', 'Skip candidate commands');
    }

    parseOptions(options: Record<string, any>, stepIndex: number) {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const command = getOpt('command');
        const verifyCommand = getOpt('verifyCommand');
        const skipCandidateCommand = getOpt('skipCandidateCommand');

        if (!command && !verifyCommand) return null;

        return {
            type: 'shell-command',
            command,
            verifyCommand,
            skipCandidateCommand: !!skipCandidateCommand,
            output: {
                mode: 'ignore',
                explode: false
            }
        };
    }
}
