import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class ShellAdapter implements CliPluginAdapter {
    readonly pluginType = 'shell-command';

    registerOptions(program: Command) {
        program.option('--shell-command <cmd>', 'Shell command to run after generation');
        program.option('--shell-verify-command <cmd>', 'Shell command to verify output');
        program.option('--shell-skip-candidate-command', 'Skip commands for candidates');
    }

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-shell-command <cmd>`, `Shell command for step ${s}`);
        program.option(`--${s}-shell-verify-command <cmd>`, `Verify command for step ${s}`);
        program.option(`--${s}-shell-skip-candidate-command`, `Skip candidate commands for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey] ?? options[key];
        };

        const command = getOpt('shellCommand');
        const verifyCommand = getOpt('shellVerifyCommand');

        if (!command && !verifyCommand) return null;

        const result: Record<string, any> = { type: 'shell-command' };
        if (command) result.command = command;
        if (verifyCommand) result.verifyCommand = verifyCommand;
        if (getOpt('shellSkipCandidateCommand')) result.skipCandidateCommand = true;

        return result;
    }
}
