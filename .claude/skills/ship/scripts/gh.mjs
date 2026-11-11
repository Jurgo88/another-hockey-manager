// GitHub without the gh CLI, through the REST API and git's stored credentials.
//
//   node gh.mjs issue <title> <body.md> [label,label...]   open an issue
//   node gh.mjs pr <title> <body.md> [base]                open a PR from the current branch
//   node gh.mjs show <number>                              title, state, labels and body
//   node gh.mjs labels                                     the repo's labels
//
// The repo comes from `git remote get-url origin`. Bodies are read from files,
// so Markdown needs no shell quoting. Prints the URL of what it created.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const git = (args, input) => execSync(`git ${args}`, { input, encoding: 'utf8' }).trim()
const remote = git('remote get-url origin')
const repo = remote.match(/github\.com[:/](.+?)(\.git)?$/)?.[1]
if (!repo) throw new Error(`origin is not a GitHub remote: ${remote}`)
const token = git('credential fill', 'protocol=https\nhost=github.com\n\n').match(
  /password=(.*)/,
)?.[1]
if (!token) throw new Error('no GitHub credential stored for git')

async function api(method, path, body) {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      authorization: `token ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'ahm-cli',
    },
    body: body && JSON.stringify(body),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(json)}`)
  return json
}

const [command, ...args] = process.argv.slice(2)
switch (command) {
  case 'issue': {
    const [title, file, labels] = args
    const issue = await api('POST', '/issues', {
      title,
      body: readFileSync(file, 'utf8'),
      labels: labels ? labels.split(',').map((l) => l.trim()) : [],
    })
    console.log(`#${issue.number} ${issue.html_url}`)
    break
  }
  case 'pr': {
    const [title, file, base = 'main'] = args
    const head = git('branch --show-current')
    const pr = await api('POST', '/pulls', { title, head, base, body: readFileSync(file, 'utf8') })
    console.log(`#${pr.number} ${pr.html_url}`)
    break
  }
  case 'show': {
    const issue = await api('GET', `/issues/${args[0]}`)
    console.log(`#${issue.number} ${issue.title} [${issue.state}]`)
    console.log(`labels: ${issue.labels.map((l) => l.name).join(', ')}\n`)
    console.log(issue.body ?? '')
    break
  }
  case 'labels': {
    const labels = await api('GET', '/labels?per_page=100')
    console.log(labels.map((l) => l.name).join('\n'))
    break
  }
  default:
    console.log(
      readFileSync(new URL(import.meta.url), 'utf8')
        .split('\n')
        .slice(0, 9)
        .join('\n'),
    )
}
