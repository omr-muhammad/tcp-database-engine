/**
 * Validators module for CLI interface
 * Strict input validation functions
 */

/**
 * Validate operation number selection
 * @param {string} input - User input
 * @param {number} max - Maximum allowed operation number
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
export function validateOperationNumber(input, max) {
    const num = parseInt(input, 10);

    if (isNaN(num)) {
        return { valid: false, error: `Invalid input. Please enter a number between 1 and ${max}.` };
    }

    if (num < 1 || num > max) {
        return { valid: false, error: `Operation ${num} does not exist. Please enter a number between 1 and ${max}.` };
    }

    return { valid: true, value: num };
}

/**
 * Validate that key is a non-empty string
 * @param {string} key - Key to validate
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
export function validateKey(key) {
    if (typeof key !== 'string') {
        return { valid: false, error: 'Key must be a string.' };
    }

    if (key.length === 0) {
        return { valid: false, error: 'Key cannot be empty.' };
    }

    if (key.length > 65535) {
        return { valid: false, error: 'Key is too long. Maximum 65535 characters.' };
    }

    return { valid: true, value: key };
}

/**
 * Valid JSON data types
 */
export const DATA_TYPES = ['string', 'number', 'boolean', 'array', 'object'];

/**
 * Validate data type selection
 * @param {string} type - Type to validate
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
export function validateDataType(type) {
    const normalizedType = type.toLowerCase();

    if (!DATA_TYPES.includes(normalizedType)) {
        return {
            valid: false,
            error: `Invalid data type. Allowed types: ${DATA_TYPES.join(', ')}.`
        };
    }

    return { valid: true, value: normalizedType };
}

/**
 * Validate and parse a number
 * @param {string} input - Input to validate
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
export function validateNumber(input) {
    const num = Number(input);

    if (isNaN(num)) {
        return { valid: false, error: `"${input}" is not a valid number.` };
    }

    return { valid: true, value: num };
}

/**
 * Validate and parse a boolean
 * @param {string} input - Input to validate (true/false)
 * @returns {{valid: boolean, value?: boolean, error?: string}}
 */
export function validateBoolean(input) {
    const normalized = input.toLowerCase();

    if (normalized === 'true') {
        return { valid: true, value: true };
    }

    if (normalized === 'false') {
        return { valid: true, value: false };
    }

    return { valid: false, error: 'Invalid boolean. Enter "true" or "false".' };
}

/**
 * Validate array length (positive integer)
 * @param {string} input - Input to validate
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
export function validateArrayLength(input) {
    const num = parseInt(input, 10);

    if (isNaN(num) || num !== Number(input)) {
        return { valid: false, error: 'Array length must be an integer.' };
    }

    if (num < 1) {
        return { valid: false, error: 'Array length must be at least 1.' };
    }

    if (num > 10000) {
        return { valid: false, error: 'Array length cannot exceed 10000.' };
    }

    return { valid: true, value: num };
}

/**
 * Validate yes/no confirmation
 * @param {string} input - User input
 * @returns {{valid: boolean, value?: boolean, error?: string}}
 */
export function validateYesNo(input) {
    const normalized = input.toLowerCase();

    if (['yes', 'y'].includes(normalized)) {
        return { valid: true, value: true };
    }

    if (['no', 'n'].includes(normalized)) {
        return { valid: true, value: false };
    }

    return { valid: false, error: 'Please enter "yes" (y) or "no" (n).' };
}

/**
 * Get the type of a value for schema validation
 * @param {any} value - Value to check
 * @returns {string}
 */
export function getValueType(value) {
    if (Array.isArray(value)) {
        return 'array';
    }
    if (value === null) {
        return 'null';
    }
    return typeof value;
}

/**
 * Validate that all objects in array have identical keys with consistent value types
 * @param {object[]} objects - Array of objects to validate
 * @param {object} schema - Expected schema { key: type }
 * @returns {{valid: boolean, error?: string}}
 */
export function validateObjectSchema(objects, schema) {
    const schemaKeys = Object.keys(schema).sort();

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const objKeys = Object.keys(obj).sort();

        // Check if keys match
        if (objKeys.length !== schemaKeys.length) {
            return {
                valid: false,
                error: `Object at index ${i} has ${objKeys.length} keys, expected ${schemaKeys.length}.`
            };
        }

        for (const key of schemaKeys) {
            if (!(key in obj)) {
                return {
                    valid: false,
                    error: `Object at index ${i} is missing key "${key}".`
                };
            }

            const expectedType = schema[key];
            const actualType = getValueType(obj[key]);

            if (actualType !== expectedType) {
                return {
                    valid: false,
                    error: `Object at index ${i}, key "${key}": expected ${expectedType}, got ${actualType}.`
                };
            }
        }
    }

    return { valid: true };
}
