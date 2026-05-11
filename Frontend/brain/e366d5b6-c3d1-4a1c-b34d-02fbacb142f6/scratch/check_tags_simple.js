const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\aditi\\OneDrive\\Desktop\\company project\\iggymet main\\Frontend\\src\\modules\\Food\\pages\\restaurant\\Feedback.jsx', 'utf8');

const tags = content.match(/<(/?)([a-zA-Z0-9\.]+)/g);
let depth = 0;
const selfClosing = ['input', 'img', 'br', 'hr', 'Bell', 'HelpCircle', 'Menu', 'ArrowLeft', 'Search', 'SlidersHorizontal', 'Loader2', 'Star', 'X', 'BottomNavOrders'];

tags.forEach(tag => {
    const name = tag.replace(/<|>/g, '').replace('/', '');
    if (selfClosing.includes(name)) return;
    
    if (tag.startsWith('</')) {
        depth--;
        console.log(`Depth ${depth} after closing ${name}`);
    } else {
        console.log(`Depth ${depth} before opening ${name}`);
        depth++;
    }
});

console.log(`Final depth: ${depth}`);
