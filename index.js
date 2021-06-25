const Core = require('@actions/core');
const Github = require('@actions/github');
const Util = require("util")
const Prefilters = {
    "BailFeatureRequest": require("./Prefilters/BailFeatureRequest"),
    "CheckRequiredFields": require("./Prefilters/CheckRequiredFields")
}

// 主入口
async function Run(){
    try{
        const Token = Core.getInput("token")
        const [Owner, Repo] = Core.getInput("repository").split('/')
        const IssueNumber = Core.getInput("issue_number")
        const Event = Core.getInput('event')
        const Octokit = Github.getOctokit(Token)

        Core.debug(Util.inspect({ Token, Repo, IssueNumber }))

        // 获取Issue信息
        const { data: Issue } = await Octokit.rest.issues.get({
            owner: Owner,
            repo: Repo,
            issue_number: IssueNumber
        })

        Core.info("Init const finish");

        // 防止追溯以前的issue
        if(IssueNumber <= 300){
            return null;
        }
        // 如果是PR直接略过
        if ("pull_request" in Issue) {
            Core.info("This issue is a Pull Request. Skipping...")
            return null;
        }

        let IsRecheck = false, OldCommentID = 0, OldCommentBody = " "

        // 如果是编辑后的则标记上等待复审
        if(Event === "edited") {
            Core.info("This issue is edited");
            if(!Array.isArray(Issue.labels)) return
            if(Issue.labels.some(i => i.name === "IssueBot: Pending Recheck")) {
                IsRecheck = true
            }else {
                return
            }
        }
        // 如果是复审的话获取上次机器人提交的信息
        if(IsRecheck) {
            Core.info("Rechecking");
            const { data: Comments } = await Octokit.rest.issues.listComments({
                owner: Owner,
                repo: Repo,
                issue_number: IssueNumber,
                page: 1,
                per_page: 10,
                sort: 'created',
                direction: 'asc'
            })
            const OldComment = Comments.find(n => n.body.startsWith("<!-- IssueBot Comment -->"))

            if (OldComment) {
                OldCommentID = OldComment.id
                OldCommentBody = OldComment.body
            }
        }

        let WantClose = false, WantLock = false, WantTags = new Set(), Problems = new Set(), Triggered = new Set()

        Core.info("Running prefilters");
        // 开始检查
        for (const [i, Prefilter] of Object.entries(Prefilters)) {
            const result = Prefilter(Issue)

            // 如果中了
            if (result.Hit) {
                Triggered.add(i)

                if (typeof result.Problems === 'string') {
                    Problems.add(result.Problems)
                } else if (Array.isArray(result.Problems) && result.Problems.length > 0) {
                    for (const p of result.Problems) {
                        Problems.add(p)
                    }
                }
                if (result.WantClose) WantClose = true
                if (result.WantNotClose) WantClose = false
                if (result.WantLock) WantLock = true
                if (result.WantNotLock) WantLock = false
                if (typeof result.WantTags === 'string') {
                    WantTags.add(result.WantTags)
                }
                else if (Array.isArray(result.WantTags) && result.WantTags.length > 0) {
                    for (const t of result.WantTags) {
                        WantTags.add(t)
                    }
                }

                if (result.Bail) break
            }
        }

        if (Triggered.size > 0) {
            if (Problems.size > 0) {
                const ChineseBody = `<!-- IssueBot Comment --> 我们在您的 Issue 中发现了如下问题：\n\n${[...Problems].map(i => `- ${i}`).join('\n')}\n\n${WantClose ? `因此您的 Issue 已被关闭${WantLock ? '并锁定' : ''}。请自行${WantLock ? '修复上述问题后重新创建新 Issue。' : '按照上述要求对 Issue 进行修改。'}` : `请自行按照上述要求对 Issue 进行修改。`}`
                const EnglishBody = `<!-- IssueBot Comment --> We found the following problems in your Issue: \n\n${[...Problems].map(i => `- ${i}`).join('\n')}\n\n${WantClose ? `So your Issue has been closed ${WantLock ? 'and locked' : ''}. Please help yourself ${WantLock ? 'to create a new Issue after the fix the problems.' : 'modify the Issue according to the above requirements.'}` : `Please modify the Issue according to the above requirements.`}`
                const Body = /[\u4E00-\u9FCC\u3400-\u4DB5\uFA0E\uFA0F\uFA11\uFA13\uFA14\uFA1F\uFA21\uFA23\uFA24\uFA27-\uFA29]|[\ud840-\ud868][\udc00-\udfff]|\ud869[\udc00-\uded6\udf00-\udfff]|[\ud86a-\ud86c][\udc00-\udfff]|\ud86d[\udc00-\udf34\udf40-\udfff]|\ud86e[\udc00-\udc1d]/g.test(Issue.body) ? ChineseBody : EnglishBody

                if (OldCommentID === 0) {
                    await Octokit.rest.issues.createComment({
                        owner: Owner,
                        repo: Repo,
                        issue_number: IssueNumber,
                        body: Body
                    })
                } else if (Body !== OldCommentBody) {
                    await Octokit.rest.issues.updateComment({
                        owner: Owner,
                        repo: Repo,
                        issue_number: IssueNumber,
                        comment_id: OldCommentID,
                        body: Body
                    })
                }
            }

            if (WantTags.size > 0) {
                await Octokit.rest.issues.addLabels({
                    owner: Owner,
                    repo: Repo,
                    issue_number: IssueNumber,
                    labels: [...WantTags]
                })
            }

            if (WantClose && Issue.state === 'open') {
                await Octokit.rest.issues.update({
                    owner: Owner,
                    repo: Repo,
                    issue_number: IssueNumber,
                    state: 'closed'
                })
            }

            if (WantLock && !Issue.locked) {
                await Octokit.rest.issues.lock({
                    owner: Owner,
                    repo: Repo,
                    issue_number: IssueNumber,
                    lock_reason: 'off-topic'
                })
            }

            if (WantClose && !WantLock && !IsRecheck) {
                // eligible for recheck
                await Octokit.rest.issues.addLabels({
                    owner: Owner,
                    repo: Repo,
                    issue_number: IssueNumber,
                    labels: ['IssueBot: Pending Recheck']
                })
            }

            if (IsRecheck) {
                if (!WantClose && Issue.state === 'closed') {
                    // here we reopen it
                    await Octokit.rest.issues.update({
                        owner: Owner,
                        repo: Repo,
                        issue_number: IssueNumber,
                        state: 'open'
                    })
                }
            }
        } else {
            // nothing is Triggered
            if (IsRecheck) {
                if (Issue.state === 'closed') {
                    // here we reopen it

                    await Octokit.rest.issues.update({
                        owner: Owner,
                        repo: Repo,
                        issue_number: IssueNumber,
                        state: 'open'
                    })

                    // remove pending recheck label
                    await Octokit.rest.issues.removeLabel({
                        owner: Owner,
                        repo: Repo,
                        issue_number: IssueNumber,
                        name: 'IssueBot: Pending Recheck'
                    })
                }

                // remove comments
                if (OldCommentID > 0) {
                    await Octokit.rest.issues.deleteComment({
                        owner: Owner,
                        repo: Repo,
                        comment_id: OldCommentID
                    })
                }
            }
        }
        Core.info("Remove Triage Label");
        await Octokit.rest.issues.removeLabel({
            owner: Owner,
            repo: Repo,
            issue_number: IssueNumber,
            name: 'Triage'
        })
    }catch (e){
        Core.error(e.stack);
        Core.setFailed(e.message);
    }
}

Run().then();
