export class PlaceService {
  constructor({ destinations }) { this.destinations = destinations; }

  save(input) { return this.destinations.create(input); }
  update(id, changes, opts) { return this.destinations.update(id, changes, opts); }
  remove(id) { return this.destinations.remove(id); }
  setFavorite(id, isFavorite) { return this.destinations.update(id, { isFavorite }); }
  listFavorites() { return this.destinations.list({ where: { isFavorite: true }, orderBy: 'name' }); }

  list({ search } = {}) {
    const q = search?.trim().toLowerCase();
    return this.destinations.list({ orderBy: 'name', predicate: (d) => !q || [d.name, d.address].some((t) => t?.toLowerCase().includes(q)) });
  }
}
