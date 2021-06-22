const Keywords = [
    /new feature/i,
    /feature/i,
    /feat/i,
    /新功能/,
    /新增/,
    /建议/,
    /提议/,
    /希望/,
    /能否支持/,
    /可否支持/,
]

module.exports = function BailFeatureRequest(Issue) {
    const Title = Issue.title

    if (Array.isArray(Issue.labels) && Issue.labels.some(i => i.name === "enhancement")) {
        return {
            Hit: false
        }
    }

    for (const k of Keywords) {
        if (k.test(Title)) {
            return {
                Hit: true,
                Bail: true,
                WantTags: "enhancement"
            }
        }
    }

    return {
        Hit: false
    }
}
