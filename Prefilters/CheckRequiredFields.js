const ChineseFilters = [
    {
        expressions: [
            /^\* \*\*Arclight\*\*\s?.{2,}$/m,
            /^\* \*\*你确认这是最新版吗\*\*\s?.{2,}/m,
            /^\* \*\*你确认所有Mod都安装了依赖\*\*\s?.{2,}/m,
            /^\* \*\*你确认所有插件都已更新至对应版本\*\*\s?.{2,}/m,
            /^\* \*\*Java\*\*\s?.{2,}/m,
            /^\* \*\*操作系统\*\*\s?.{2,}/m
        ],
        required: true,
        description: "您的Issue中缺少必要的环境信息，这些信息对于 Bug 调试十分重要，缺少这些信息将很难解决您提出的Bug。请重新创建Issue并完整填写环境信息。"
    },
    {
        expressions: [
            /### 报错信息\r?\n?[\s\S]{10,}?(?:\r\n\[错误日志\])?/,
            /### 错误描述\r?\n?[\s\S]{10,}?/
        ],
        required: false,
        description: "没有在Issue描述中找到对应的报错信息或描述。完整的描述或报错信息有助于快速定位问题。请尝试复现并补全错误描述或报错信息。"
    }
]
const EnglishFilters = [
    {
        expressions: [
            /^\* \*\*Arclight\*\*\s?.{2,}$/m,
            /^\* \*\*This is the latest development version\*\*\s?.{2,}/m,
            /^\* \*\*Java\*\*\s?.{2,}/m,
            /^\* \*\*Operating System\*\*\s?.{2,}/m
        ],
        required: true,
        description: "Your Issue is missing the necessary environment information that is important for Bug debugging, and the absence of this information will make it difficult to resolve the bugs you propose. Please recreate the Issue and complete environmental information."
    },
    {
        expressions: [
            /### Logs\r?\n?[\s\S]{10,}?(?:\r\n\[ERROR LOG\])?/,
            /### Description\r?\n?[\s\S]{10,}?/
        ],
        required: false,
        description: "Not found in the Issue description corresponding error message or describe. The complete description or error message helps rapid positioning problem. Please try to repetition and completion error description or error message."
    }
]

module.exports = function CheckRequiredFields(Issue) {
    if (!Issue.labels.some(i => i.name === "Triage")) return { Hit: false }
    const Body = Issue.body
    const Hits = []

    // 检测是不是英文报告
    let Filters = /I am running/m.test(Body) ? EnglishFilters : ChineseFilters
    for (const f of Filters) {
        for (const exp of f.expressions) {
            if (!exp.test(Body)) {
                Hits.push(f)
                break
            }
        }
    }

    if (Hits.length > 0) {
        let Problems = [], Required = false
        for (const p of Hits) {
            Problems.push(p.description)
            if (p.required) Required = true
        }
        return {
            Hit: true,
            Bail: false,
            Problems,
            WantClose: Required,
            WantTags: 'need more info'
        }
    } else {
        return {
            Hit: false
        }
    }
}
