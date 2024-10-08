// utils/ot.js

function generateOperation(oldStr, newStr) {
    let i = 0;
    const ops = [];

    while (i < oldStr.length || i < newStr.length) {
        if (oldStr[i] !== newStr[i]) {
            let j = i;
            while (j < newStr.length && oldStr[i] !== newStr[j]) {
                j++;
            }
            if (j > i) {
                ops.push({ insert: newStr.slice(i, j), position: i });
                i = j;
            } else {
                ops.push({ delete: 1, position: i });
            }
        } else {
            i++;
        }
    }

    return ops;
}

function applyOperation(str, ops) {
    let result = str;
    for (const op of ops) {
        if (op.insert) {
            result = result.slice(0, op.position) + op.insert + result.slice(op.position);
        } else if (op.delete) {
            result = result.slice(0, op.position) + result.slice(op.position + op.delete);
        }
    }
    return result;
}

module.exports = { generateOperation, applyOperation };