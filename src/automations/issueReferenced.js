exports.run = async function(client, pullRequest, repository, opened) {
  const author = pullRequest.user.login;
  const number = pullRequest.number;
  const repoName = repository.name;
  const repoOwner = repository.owner.login;

  const response = await client.pullRequests.getCommits({
    owner: repoOwner, repo: repoName, number: number
  });
  const refIssues = response.data.filter(c => {
    return client.findKeywords(c.commit.message);
  }).map(c => c.commit.message.match(/#([0-9]+)/)[1]);

  if (!refIssues.length && client.findKeywords(pullRequest.body)) {
    const comment = client.templates.get("fixCommitMessage")
      .replace(new RegExp("{author}", "g"), author);
    return client.issues.createComment({
      owner: repoOwner, repo: repoName, number: number, body: comment
    });
  }

  if (!opened) return;

  Array.from(new Set(refIssues)).forEach(referencedIssue => {
    exports.referenceIssue(client, referencedIssue, number, repository);
  });
};

exports.referenceIssue = async function(client, refIssue, number, repo) {
  const repoName = repo.name;
  const repoOwner = repo.owner.login;

  const labels = await client.issues.getIssueLabels({
    owner: repoOwner, repo: repoName, number: refIssue
  });
  const issueLabels = labels.data.filter(l => {
    return client.cfg.issues.area.labels.has(l.name);
  }).map(l => l.name);

  const teams = issueLabels.map(l => client.cfg.issues.area.labels.get(l));

  if (!teams.length) return;

  // Create unique array of teams (labels can point to same team)
  const unique = Array.from(new Set(teams));

  const uniqueTeams = `@${repoOwner}/` + unique.join(`, @${repoOwner}/`);
  const areaLabels = issueLabels.join("\", \"");

  const labelSize = issueLabels.length === 1 ? "label" : "labels";

  const comment = client.templates.get("areaLabelNotification")
    .replace(new RegExp("{teams}", "g"), uniqueTeams)
    .replace(new RegExp("{payload}", "g"), "pull request")
    .replace(new RegExp("{refs}", "g"), `"${areaLabels}"`)
    .replace(new RegExp("{labels}", "g"), labelSize);

  client.issues.createComment({
    owner: repoOwner, repo: repoName, number: number, body: comment
  });
};
