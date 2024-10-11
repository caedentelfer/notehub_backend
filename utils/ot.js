function generateOperation(oldStr, newStr) {
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

function applyOperation(str, ops) {
    let result = str;
    // Sort operations in reverse order to prevent position shifting
    ops.sort((a, b) => b.position - a.position);
    for (const op of ops) {
        if (op.insert) {
            result =
                result.slice(0, op.position) +
                op.insert +
                result.slice(op.position);
        } else if (op.delete) {
            result =
                result.slice(0, op.position) +
                result.slice(op.position + op.delete);
        }
    }
    return result;
}

module.exports = { generateOperation, applyOperation };
