import re

def check_balance(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove comments
    content = re.sub(r'\{/\*.*?\*/\}', '', content, flags=re.DOTALL)
    content = re.sub(r'//.*', '', content)
    
    tags = re.findall(r'<(/?)([a-zA-Z0-9\.]+)', content)
    stack = []
    for is_closing, tag_name in tags:
        if tag_name in ['input', 'img', 'br', 'hr', 'Bell', 'HelpCircle', 'Menu', 'ArrowLeft', 'Search', 'SlidersHorizontal', 'Loader2', 'Star', 'X']:
            continue
        if is_closing:
            if not stack:
                print(f"Extra closing tag: {tag_name}")
            else:
                top = stack.pop()
                if top != tag_name:
                    print(f"Mismatched tags: opened {top}, closing {tag_name}")
        else:
            stack.append(tag_name)
    
    if stack:
        print(f"Unclosed tags: {stack}")
    else:
        print("All tags balanced")

check_balance(r'c:\Users\aditi\OneDrive\Desktop\company project\iggymet main\Frontend\src\modules\Food\pages\restaurant\Feedback.jsx')
