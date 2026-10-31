# AZ / play

A complete, original AZ-kvíz-inspired game for **two people sharing one browser**. Take turns answering questions and build one connected group of hexagons that touches all three sides of the triangle.

The game uses only HTML, CSS and vanilla JavaScript. No framework, package installation, build step, backend, database, account or API key is needed to play. It does **not** synchronize games across devices.

## Put it online with one command

From this folder, run:

```sh
./publish.sh
```

This creates a **public** `az-quiz` repository in your GitHub account, pushes the public game files, enables GitHub Pages and waits for the deployment. It prints your live URL, usually `https://YOUR-USERNAME.github.io/az-quiz/`. Run the same command again to publish changes.

One-time prerequisites: install [GitHub CLI](https://cli.github.com/) and Git, then sign in with `gh auth login --hostname github.com`. On macOS, Linux or Windows Git Bash, run the command above. If the executable permission was lost when downloading, use `bash publish.sh` instead. Authentication is handled by GitHub CLI; never paste a token into the game or source files.

To choose another repository name:

```sh
./publish.sh my-quiz-game
```

The publisher refuses to overwrite an unrelated existing repository. It uses a temporary checkout, a fixed list of public files, a basic check for common credential patterns, and your GitHub noreply email for commits. It never uploads this folder wholesale or reads your `.env` files. The pattern check is a precaution, not a guarantee that arbitrary text contains no sensitive information: only put public content in the listed public files. A failed deployment is reported with a link to GitHub’s deployment status.

## Publish using the GitHub website instead

1. Sign in to GitHub and create a **public** repository named `az-quiz`.
2. Choose **Add file → Upload files**. Upload `index.html`, `style.css`, `script.js`, `sample-quiz.txt`, `sample-drill2.txt`, and optionally this README, directly to the repository root. Commit to `main`.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Choose branch **main**, folder **/(root)**, and click **Save**.
6. Wait for the Pages deployment to finish. Open the URL shown in Pages settings: `https://YOUR-USERNAME.github.io/az-quiz/`.

Keep `index.html` at the selected root and use the exact lowercase filenames. Future commits to `main` update the site. If it has not appeared yet, inspect the repository’s **Actions** tab. See [GitHub’s publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Play

1. Paste at least **28 valid, distinct questions** into the large question-bank box, or select **Use sample quiz**. Click **Let’s play**.
2. Questions are shuffled across 28 hexagons in seven rows. For larger banks, 28 are selected randomly for each match.
3. Red starts. Select an open tile and answer aloud. Selecting a question locks the turn to that tile, including after a reload.
4. The other player reveals the answer and selects **Correct answer** or **Wrong answer**. For multiple-choice questions, the answer must include all marked choices.
5. Correct answers claim the tile in your color. Wrong answers make it neutral. Either result passes the turn.
6. A neutral tile is eligible when it touches one of your tiles. If you own no tiles, you can claim any neutral tile. Select it and click **Claim**. This consumes your turn without a new question. An ineligible neutral tile explains why it cannot be claimed.
7. Win by forming **one connected group** that touches the left, right and bottom boundaries. Corners count toward both touching sides. Owning three disconnected edge tiles is not a win. The winning component is highlighted and further moves stop.

If a player cannot move, their turn passes automatically. If neither can move, the game declares a draw. Neutral claiming is an explicitly simplified house rule; this is an independent game, not an official recreation of the television show.

## Question formats

### Question;Answer

One pair per line, with a semicolon between the question and answer:

```text
What is the capital of Czechia?;Prague
How many sides does a hexagon have?;6
```

Blank lines are ignored. CRLF, CR and LF line endings and a UTF-8 BOM are handled. For a semicolon or a real line break inside a field, use CSV-style double quotes. Inside a quoted field, represent a literal quote with two quotes:

```text
"Complete the phrase:
To be, or not to be";"That is the question."
"What does ""A;B"" contain?";A semicolon
```

Unclosed quotes, missing fields and extra unquoted semicolons produce line-specific errors. Invalid input blocks the entire import; it is never silently partially imported. Exact duplicates are removed with a notice. Limits are 1,000,000 input characters, 5,000 questions, 100 choices per question and 20,000 characters per field.

### Drill 2 / PDS

Paste the contents of your Drill 2 question-bank file. Format is detected from marked answer choices, or select **Drill 2 / PDS** explicitly. Separate question blocks with a blank line:

```text
[#12] Which of these cities are in Czechia?
Select all that apply.
>>>A) Prague
B) Vienna
>>>C) Brno

Which planet is known as the Red Planet?
A) Venus
>>>B) Mars
C) Jupiter
```

Supported: multiline question bodies, continued answer lines, lettered choices, one or more `>` markers, multiple correct choices, optional `[#id]` identifiers and textual explanations from a valid trailing `<options>` JSON block. Each block must have a question, at least two nonempty choices and at least one marked correct choice. Choice order is preserved.

Options such as custom grading, timers, Markdown rendering and MathJax are **not executed or implemented**. Markdown, HTML and formulas appear as literal text. Embedded scripts and remote images are never rendered. Questions and answers are inserted with `textContent`, never interpreted as HTML. Drill format reference: [Drill 2 documentation](https://github.com/gronostajo/drill2/wiki/File-format), [options block](https://github.com/gronostajo/drill2/wiki/options--block).

The included `sample-quiz.txt` contains 28 general-knowledge questions and is also built into the **Use sample quiz** button. `sample-drill2.txt` contains the same 28 questions in the Drill 2 block format with answer choices. These are original example banks; no question-bank download from another service is required.

## Saved games and privacy

- Every selection, answer reveal, move and result saves under `az-play.game.v1` in `localStorage`. Reloading restores the board, turn, selected question and revealed-answer state. A corrupt or unsupported save is rejected with a notice.
- **Restart match** confirms before clearing the board and reshuffles the same imported bank. **New quiz** confirms before removing the saved match and question bank and returning to blank setup.
- Saves belong to this browser profile and site origin. Moving between `file://`, localhost and GitHub Pages does not transfer saves. Same-origin tabs can observe storage updates; there is no server or cross-device synchronization.
- If storage is blocked or full, the game still works and clearly reports that progress is not saved. Clearing browser data removes saves. Local-file storage behavior varies by browser; use the hosted site for reliable persistence.
- The game makes no network requests after its static assets load. There are no remote fonts, trackers, analytics, third-party scripts or credentials. A Content Security Policy blocks network connections and embedded code.
- Custom pasted questions stay in browser storage. They are never included in a deployment. Files uploaded to GitHub Pages, including the bundled sample banks, are public. Answers can be inspected in browser tools: this is a shared-screen game, not a secure examination system. Do not put private keys, passwords or sensitive records into public source files or a question bank.

## Local preview and checks (optional)

Open `index.html` directly, or serve the folder with Python’s standard library:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000`. No build is necessary.

If Node.js is installed, run the meaningful engine/parser tests with its built-in test runner:

```sh
node --test tests/*.test.cjs
```

Node is used only for tests, not to run or publish the browser game. The publishing script needs Git and GitHub CLI, not Node or npm.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Accessible page structure, controls, dialogs and security policy |
| `style.css` | Original responsive design and hexagonal board |
| `script.js` | Import parser, game engine, rendering and persistence |
| `sample-quiz.txt` | 28-question semicolon sample |
| `sample-drill2.txt` | 28-question Drill 2 sample |
| `publish.sh` | One-command GitHub Pages publishing |
| `.nojekyll` | Marks the deployment as a plain static site |
| `.gitignore` | Excludes common local secret/configuration files from Git |
| `tests/game.test.cjs` | Dependency-free regression tests; not deployed |
| `tests/publish.test.cjs` | Offline publishing and file-exclusion tests; not deployed |

All assets use relative paths, so both GitHub Pages project URLs and domain-root hosting work. No association with or endorsement by AZ-kvíz or Drill 2 is implied.
