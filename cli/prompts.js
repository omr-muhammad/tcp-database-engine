/**
 * Prompts module for CLI interface
 * Handles all user input prompting using Node.js readline interface
 */
import readline from 'node:readline';

const EXIT_COMMAND = '.exit';

/**
 * Create readline interface for stdin/stdout
 * @returns {readline.Interface}
 */
export function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

/**
 * Check if input is the exit command
 * @param {string} input - User input to check
 * @returns {boolean}
 */
export function isExitCommand(input) {
    return input.trim().toLowerCase() === EXIT_COMMAND;
}

/**
 * Generic async prompt function
 * @param {readline.Interface} rl - Readline interface
 * @param {string} message - Prompt message
 * @returns {Promise<string>}
 */
export function prompt(rl, message) {
    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            resolve(answer.trim());
        });
    });
}

/**
 * Display a numbered menu and get user selection
 * @param {readline.Interface} rl - Readline interface
 * @param {string} title - Menu title
 * @param {string[]} options - Menu options
 * @returns {Promise<string>}
 */
export async function displayMenu(rl, title, options) {
    console.log(`\n${title}`);
    console.log('─'.repeat(40));

    options.forEach((option, index) => {
        console.log(`  ${index + 1}. ${option}`);
    });

    console.log(`\n  Type "${EXIT_COMMAND}" to cancel/quit`);
    console.log('─'.repeat(40));

    return prompt(rl, 'Enter your choice: ');
}

/**
 * Display an error message in a formatted way
 * @param {string} message - Error message
 */
export function displayError(message) {
    console.log(`\n❌ Error: ${message}\n`);
}

/**
 * Display a success message
 * @param {string} message - Success message
 */
export function displaySuccess(message) {
    console.log(`\n✓ ${message}\n`);
}

/**
 * Display server response
 * @param {object} response - Server response object
 */
export function displayResponse(response) {
    console.log('\n─── Server Response ───');
    console.log(`Status: ${response.status}`);

    if (response.data !== undefined) {
        if (typeof response.data === 'object') {
            console.log('Data:', JSON.stringify(response.data, null, 2));
        } else {
            console.log('Data:', response.data);
        }
    }

    if (response.message) {
        console.log('Message:', response.message);
    }

    console.log('───────────────────────\n');
}
