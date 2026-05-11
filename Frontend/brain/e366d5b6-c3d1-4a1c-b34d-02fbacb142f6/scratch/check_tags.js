const fs = require('fs');

function checkBalance(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove comments
    content = content.replace(/\{\/\*.*?\*\/\}/gs, '');
    content = content.replace(/\/\/.*$/gm, '');
    
    const tagRegex = /<(/?)([a-zA-Z0-9\.]+)/g;
    let match;
    let stack = [];
    const selfClosing = ['input', 'img', 'br', 'hr', 'Bell', 'HelpCircle', 'Menu', 'ArrowLeft', 'Search', 'SlidersHorizontal', 'Loader2', 'Star', 'X'];

    while ((match = tagRegex.exec(content)) !== null) {
        const isClosing = match[1] === '/';
        const tagName = match[2];

        if (selfClosing.includes(tagName)) continue;

        if (isClosing) {
            if (stack.length === 0) {
                console.log(`Extra closing tag: ${tagName}`);
            } else {
                const top = stack.pop();
                if (top !== tagName) {
                    console.log(`Mismatched tags: opened ${top}, closing ${tagName}`);
                }
            }
        } else {
            // Check if it's self-closing like <img />
            const restOfTag = content.substring(match.index, content.indexOf('>', match.index) + 1);
            if (restOfTag.endsWith('/>')) continue;

            stack.push(tagName);
        }
    }
    
    if (stack.length > 0) {
        console.log(`Unclosed tags: ${stack.join(', ')}`);
    } else {
        console.log("All tags balanced");
    }
}

checkBalance('c:\\Users\\aditi\\OneDrive\\Desktop\\company project\\iggymet main\\Frontend\\src\\modules\Food\\pages\\restaurant\\Feedback.jsx');
