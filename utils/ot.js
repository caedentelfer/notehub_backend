// backend/utils/ot.js

function generateOperation(oldStr, newStr) {
    const ops = [];
    let index = 0;

    while (index < oldStr.length || index < newStr.length) {
        if (oldStr[index] !== newStr[index]) {
            break;
        }
        index++;
    }

    if (index < oldStr.length) {
        ops.push({ type: 'delete', position: index, count: oldStr.length - index });
    }
    if (index < newStr.length) {
        ops.push({ type: 'insert', position: index, text: newStr.slice(index) });
    }

    return ops;
}

function applyOperation(str, ops) {
    let result = str;
    for (const op of ops) {
        if (op.type === 'insert') {
            result =
                result.slice(0, op.position) +
                op.text +
                result.slice(op.position);
        } else if (op.type === 'delete') {
            result =
                result.slice(0, op.position) +
                result.slice(op.position + op.count);
        }
    }
    return result;
}

function transformOperation(opA, opB) {
    const transformedOps = [];
    for (const a of opA) {
        let transformedOp = { ...a };
        for (const b of opB) {
            if (a.type === 'insert' && b.type === 'insert') {
                if (a.position >= b.position) {
                    transformedOp.position += b.text.length;
                }
            } else if (a.type === 'insert' && b.type === 'delete') {
                if (a.position >= b.position) {
                    transformedOp.position -= b.count;
                }
            } else if (a.type === 'delete' && b.type === 'insert') {
                if (a.position >= b.position) {
                    transformedOp.position += b.text.length;
                }
            } else if (a.type === 'delete' && b.type === 'delete') {
                if (a.position >= b.position && a.position < b.position + b.count) {
                    // Overlapping deletes; adjust accordingly
                    const overlap = (b.position + b.count) - a.position;
                    transformedOp.count -= overlap;
                    transformedOp.position = b.position;
                } else if (a.position >= b.position + b.count) {
                    transformedOp.position -= b.count;
                }
            }
        }
        transformedOps.push(transformedOp);
    }
    return transformedOps;
}

module.exports = {
    generateOperation,
    applyOperation,
    transformOperation,
};