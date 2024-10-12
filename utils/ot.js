// backend/utils/ot.js

/**
 * Represents a single operation.
 * @typedef {Object} Operation
 * @property {number} position - The position in the text.
 * @property {number} [delete] - Number of characters to delete.
 * @property {string} [insert] - String to insert.
 */

/**
 * Transforms a single operation against another single operation.
 * @param {Operation} op1 - The first operation.
 * @param {Operation} op2 - The second operation to transform against.
 * @returns {Operation} - The transformed operation.
 */
function transformOperation(op1, op2) {
    const transformedOp = { ...op1 };

    if (op1.insert !== undefined) {
        if (op2.insert !== undefined) {
            if (op1.position > op2.position || (op1.position === op2.position && op1.insert > op2.insert)) {
                transformedOp.position += op2.insert.length;
            }
        } else if (op2.delete !== undefined) {
            if (op1.position > op2.position) {
                transformedOp.position -= Math.min(op2.delete, op1.position - op2.position);
            }
        }
    } else if (op1.delete !== undefined) {
        if (op2.insert !== undefined) {
            if (op1.position >= op2.position) {
                transformedOp.position += op2.insert.length;
            }
        } else if (op2.delete !== undefined) {
            if (op1.position > op2.position) {
                transformedOp.position -= Math.min(op2.delete, op1.position - op2.position);
            } else if (op1.position === op2.position) {
                transformedOp.delete = Math.max(0, op1.delete - op2.delete);
            }
        }
    }

    return transformedOp;
}

/**
 * Transforms a list of operations against another list of operations.
 * @param {Operation[]} clientOps - Operations from the client.
 * @param {Operation[]} serverOps - Operations from the server.
 * @returns {Operation[]} - Transformed client operations.
 */
function transformOperations(clientOps, serverOps) {
    let transformedClientOps = clientOps.map(op => ({ ...op }));

    serverOps.forEach(serverOp => {
        transformedClientOps = transformedClientOps.map(clientOp => transformOperation(clientOp, serverOp));
    });

    return transformedClientOps;
}

/**
 * Applies a list of operations to a string.
 * @param {string} str - The original string.
 * @param {Operation[]} ops - Operations to apply.
 * @returns {string} - The transformed string.
 */
function applyOperations(str, ops) {
    let result = str;
    // Sort operations in reverse order to prevent position shifting
    ops.sort((a, b) => b.position - a.position);
    for (const op of ops) {
        if (op.insert !== undefined) {
            result = result.slice(0, op.position) + op.insert + result.slice(op.position);
        } else if (op.delete !== undefined) {
            result = result.slice(0, op.position) + result.slice(op.position + op.delete);
        }
    }
    return result;
}

/**
 * Generates a list of operations based on the difference between old and new strings.
 * @param {string} oldStr - The original string.
 * @param {string} newStr - The updated string.
 * @returns {Operation[]} - The list of operations.
 */
function generateOperations(oldStr, newStr) {
    const ops = [];
    let commonStart = 0;
    while (
        commonStart < oldStr.length &&
        commonStart < newStr.length &&
        oldStr[commonStart] === newStr[commonStart]
    ) {
        commonStart++;
    }

    let commonEnd = 0;
    while (
        commonEnd < (oldStr.length - commonStart) &&
        commonEnd < (newStr.length - commonStart) &&
        oldStr[oldStr.length - 1 - commonEnd] === newStr[newStr.length - 1 - commonEnd]
    ) {
        commonEnd++;
    }

    const oldMiddle = oldStr.slice(commonStart, oldStr.length - commonEnd);
    const newMiddle = newStr.slice(commonStart, newStr.length - commonEnd);

    if (oldMiddle.length > 0) {
        ops.push({ delete: oldMiddle.length, position: commonStart });
    }
    if (newMiddle.length > 0) {
        ops.push({ insert: newMiddle, position: commonStart });
    }

    return ops;
}

module.exports = { transformOperation, transformOperations, applyOperations, generateOperations };
