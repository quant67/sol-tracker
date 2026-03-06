const { execSync } = require('child_process');
const fs = require('fs');

try {
    const status = execSync('git status', { encoding: 'utf8' });
    fs.writeFileSync('git_status_output.txt', status);

    execSync('git add .');
    const commit = execSync('git commit -m "feat: initial monitoring system implementation"', { encoding: 'utf8' });
    fs.appendFileSync('git_status_output.txt', '\n--- COMMIT ---\n' + commit);
} catch (err) {
    fs.writeFileSync('git_status_output.txt', 'ERROR: ' + err.message + '\n' + err.stdout + '\n' + err.stderr);
}
