/** "Remove sample data without touching my records": only deletes records flagged isSample. */
export class SampleDataService {
  constructor(repositories) { this.repositories = repositories; }

  async removeAll() {
    const counts = {};
    for (const [name, repo] of Object.entries(this.repositories)) counts[name] = await repo.removeSamples();
    return counts;
  }
}
