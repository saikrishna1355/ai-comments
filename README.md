## ai-comments

AI-powered code comment generator CLI. It scans your source files and inserts brief explanations above functions that do not have comments yet.

### Install globally

```bash
npm install -g ai-comments
```

After that you can run `ai-comments` from any project.

### Basic usage

From the root of your project, run the tool and pass the path to your source folder (for example `src`):

```bash
ai-comments ./src
```

This will:

- Walk the `./src` directory and find `*.js`, `*.ts`, `*.jsx`, `*.tsx` files.
- Detect functions and simple arrow functions.
- Add short, human‑readable comments above functions that do not already have a comment.

### Local development (this repo)

If you are working on the package itself:

```bash
npm install
node bin/ai-comments.js ./src --dry-run
```

`--dry-run` prints what would be changed without modifying files.

### Notes

- No external AI service is required; comments are generated heuristically from the function name, parameters, and common patterns in the body.
- You can publish this package to npm under your own scope/name and use the same commands shown above.

### Source code and contributions

- The code is intended to live in a public GitHub repository - `https://github.com/saikrishna1355/ai-comments` .
- You are free to fork the repository, customize the behavior, or use it as a starting point for your own tools.
- If you find bugs or have ideas for improvements, you can raise an issue in the GitHub repo.
- Pull requests are welcome; changes that improve comments, configuration options, or developer experience are especially appreciated.
