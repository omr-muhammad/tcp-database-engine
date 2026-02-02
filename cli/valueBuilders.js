/**
 * Value Builders module for CLI interface
 * Functions for building complex JSON values with validation
 */
import { prompt, displayError, isExitCommand } from './prompts.js';
import {
    validateNumber,
    validateBoolean,
    validateArrayLength,
    validateKey,
    validateYesNo,
    DATA_TYPES,
    validateObjectSchema,
    getValueType,
} from './validators.js';

/**
 * Exception class to signal user wants to exit/cancel
 */
export class ExitException extends Error {
    constructor() {
        super('Operation cancelled by user.');
        this.name = 'ExitException';
    }
}

/**
 * Helper to prompt with exit checking
 * @param {readline.Interface} rl - Readline interface
 * @param {string} message - Prompt message
 * @returns {Promise<string>}
 * @throws {ExitException} if user enters exit command
 */
async function promptWithExit(rl, message) {
    const input = await prompt(rl, message);

    if (isExitCommand(input)) {
        throw new ExitException();
    }

    return input;
}

/**
 * Build a string value
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<string>}
 */
export async function buildString(rl) {
    const value = await promptWithExit(rl, 'Enter string value: ');
    return value;
}

/**
 * Build a number value with validation
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<number>}
 */
export async function buildNumber(rl) {
    while (true) {
        const input = await promptWithExit(rl, 'Enter number value: ');
        const result = validateNumber(input);

        if (result.valid) {
            return result.value;
        }

        displayError(result.error);
    }
}

/**
 * Build a boolean value with validation
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<boolean>}
 */
export async function buildBoolean(rl) {
    while (true) {
        const input = await promptWithExit(rl, 'Enter boolean value (true/false): ');
        const result = validateBoolean(input);

        if (result.valid) {
            return result.value;
        }

        displayError(result.error);
    }
}

/**
 * Get a valid data type selection from user
 * @param {readline.Interface} rl - Readline interface
 * @param {string} context - Context message for the prompt
 * @returns {Promise<string>}
 */
export async function selectDataType(rl, context = '') {
    const contextMsg = context ? `${context}\n` : '';
    console.log(`\n${contextMsg}Select data type:`);

    DATA_TYPES.forEach((type, index) => {
        console.log(`  ${index + 1}. ${type}`);
    });

    while (true) {
        const input = await promptWithExit(rl, 'Enter type number: ');
        const num = parseInt(input, 10);

        if (!isNaN(num) && num >= 1 && num <= DATA_TYPES.length) {
            return DATA_TYPES[num - 1];
        }

        displayError(`Please enter a number between 1 and ${DATA_TYPES.length}.`);
    }
}

/**
 * Build value based on type
 * @param {readline.Interface} rl - Readline interface
 * @param {string} type - Data type
 * @returns {Promise<any>}
 */
export async function buildValueByType(rl, type) {
    switch (type) {
        case 'string':
            return buildString(rl);
        case 'number':
            return buildNumber(rl);
        case 'boolean':
            return buildBoolean(rl);
        case 'array':
            return buildArray(rl);
        case 'object':
            return buildObject(rl);
        default:
            throw new Error(`Unknown type: ${type}`);
    }
}

/**
 * Build an object schema for arrays of objects
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<object>} Schema mapping key -> type
 */
export async function buildObjectSchema(rl) {
    console.log('\n📋 Define the object schema (all objects must have these keys):');

    const schema = {};

    while (true) {
        // Get key name
        const keyInput = await promptWithExit(rl, 'Enter key name: ');
        const keyResult = validateKey(keyInput);

        if (!keyResult.valid) {
            displayError(keyResult.error);
            continue;
        }

        const key = keyResult.value;

        // Get value type for this key
        const type = await selectDataType(rl, `Type for key "${key}":`);

        // For nested complex types, we only allow simple types in schema
        if (type === 'array' || type === 'object') {
            displayError('Nested arrays and objects in schema are not supported. Use string, number, or boolean.');
            continue;
        }

        schema[key] = type;

        // Ask if more keys
        while (true) {
            const moreInput = await promptWithExit(rl, 'Add another key? (yes/no): ');
            const moreResult = validateYesNo(moreInput);

            if (moreResult.valid) {
                if (!moreResult.value) {
                    return schema;
                }
                break; // Continue adding keys
            }

            displayError(moreResult.error);
        }
    }
}

/**
 * Build an object from schema
 * @param {readline.Interface} rl - Readline interface
 * @param {object} schema - Schema { key: type }
 * @param {number} index - Object index for display
 * @returns {Promise<object>}
 */
export async function buildObjectFromSchema(rl, schema, index) {
    console.log(`\n📝 Enter values for object ${index + 1}:`);

    const obj = {};

    for (const [key, type] of Object.entries(schema)) {
        console.log(`  Key "${key}" (${type}):`);
        obj[key] = await buildSimpleValue(rl, type);
    }

    return obj;
}

/**
 * Build a simple value (string, number, boolean)
 * @param {readline.Interface} rl - Readline interface
 * @param {string} type - Data type
 * @returns {Promise<any>}
 */
async function buildSimpleValue(rl, type) {
    switch (type) {
        case 'string':
            return buildString(rl);
        case 'number':
            return buildNumber(rl);
        case 'boolean':
            return buildBoolean(rl);
        default:
            throw new Error(`Unsupported simple type: ${type}`);
    }
}

/**
 * Build an array with homogeneous elements
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<any[]>}
 */
export async function buildArray(rl) {
    // Get array length
    let length;
    while (true) {
        const lengthInput = await promptWithExit(rl, 'Enter array length: ');
        const result = validateArrayLength(lengthInput);

        if (result.valid) {
            length = result.value;
            break;
        }

        displayError(result.error);
    }

    // Get element type
    const elementType = await selectDataType(rl, 'Select the data type for ALL array elements:');

    const array = [];

    // Special handling for array of objects
    if (elementType === 'object') {
        console.log('\n⚠️  For arrays of objects, all objects must have identical keys with consistent value types.');

        // Define schema first
        const schema = await buildObjectSchema(rl);

        console.log('\nSchema defined:');
        for (const [key, type] of Object.entries(schema)) {
            console.log(`  - ${key}: ${type}`);
        }

        // Build each object from schema
        for (let i = 0; i < length; i++) {
            const obj = await buildObjectFromSchema(rl, schema, i);
            array.push(obj);
        }

        // Validate all objects conform to schema
        const validationResult = validateObjectSchema(array, schema);
        if (!validationResult.valid) {
            throw new Error(validationResult.error);
        }
    } else if (elementType === 'array') {
        displayError('Nested arrays are not supported.');
        throw new Error('Nested arrays are not supported.');
    } else {
        // Simple types
        for (let i = 0; i < length; i++) {
            console.log(`\nElement ${i + 1} of ${length}:`);
            const element = await buildSimpleValue(rl, elementType);
            array.push(element);
        }
    }

    return array;
}

/**
 * Build an object with key-value pairs
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<object>}
 */
export async function buildObject(rl) {
    const obj = {};

    console.log('\n📝 Build object (enter key-value pairs):');

    while (true) {
        // Get key
        let key;
        while (true) {
            const keyInput = await promptWithExit(rl, 'Enter key name: ');
            const keyResult = validateKey(keyInput);

            if (keyResult.valid) {
                key = keyResult.value;
                break;
            }

            displayError(keyResult.error);
        }

        // Check for duplicate key
        if (key in obj) {
            console.log(`⚠️  Key "${key}" already exists and will be overwritten.`);
        }

        // Get value type
        const type = await selectDataType(rl, `Type for key "${key}":`);

        // Get value
        const value = await buildValueByType(rl, type);
        obj[key] = value;

        // Ask if more keys
        while (true) {
            const moreInput = await promptWithExit(rl, 'Add another key? (yes/no): ');
            const moreResult = validateYesNo(moreInput);

            if (moreResult.valid) {
                if (!moreResult.value) {
                    return obj;
                }
                break; // Continue adding keys
            }

            displayError(moreResult.error);
        }
    }
}
