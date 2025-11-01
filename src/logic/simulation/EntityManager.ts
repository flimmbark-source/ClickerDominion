import { Village } from './entities';

export class EntityManager {
  private readonly villages = new Map<number, Village>();
  private readonly villagerToVillage = new Map<number, number>();
  private readonly villageVillagerCounts = new Map<number, number>();
  private readonly villageMilitia = new Map<number, number>();
  private readonly militiaToVillage = new Map<number, number>();

  registerVillage(entityId: number, village: Village): void {
    this.villages.set(entityId, village);
    this.villageVillagerCounts.set(entityId, village.population);
    if (!this.villageMilitia.has(entityId)) {
      this.villageMilitia.set(entityId, 0);
    }
  }

  registerVillager(entityId: number, villageId: number): void {
    this.villagerToVillage.set(entityId, villageId);
    const current = this.villageVillagerCounts.get(villageId) ?? 0;
    this.villageVillagerCounts.set(villageId, current + 1);
    const village = this.villages.get(villageId);
    if (village) {
      village.incrementPopulation();
    }
  }

  getVillage(entityId: number): Village | undefined {
    return this.villages.get(entityId);
  }

  getVillagerCount(villageId: number): number {
    return this.villageVillagerCounts.get(villageId) ?? 0;
  }

  getHomeVillage(villagerId: number): number | undefined {
    return this.villagerToVillage.get(villagerId);
  }

  getActiveMilitiaCount(villageId: number): number {
    return this.villageMilitia.get(villageId) ?? 0;
  }

  registerMilitia(entityId: number, villageId: number): void {
    this.villageMilitia.set(villageId, (this.villageMilitia.get(villageId) ?? 0) + 1);
    this.militiaToVillage.set(entityId, villageId);
  }

  unregisterMilitia(entityId: number): void {
    const villageId = this.militiaToVillage.get(entityId);
    if (villageId === undefined) {
      return;
    }
    this.militiaToVillage.delete(entityId);
    const current = this.villageMilitia.get(villageId) ?? 0;
    this.villageMilitia.set(villageId, Math.max(0, current - 1));
  }

  removeEntity(entityId: number): void {
    if (this.villagerToVillage.has(entityId)) {
      const villageId = this.villagerToVillage.get(entityId)!;
      this.villagerToVillage.delete(entityId);
      const current = this.villageVillagerCounts.get(villageId) ?? 0;
      this.villageVillagerCounts.set(villageId, Math.max(0, current - 1));
      const village = this.villages.get(villageId);
      if (village) {
        village.decrementPopulation();
      }
      return;
    }

    if (this.militiaToVillage.has(entityId)) {
      this.unregisterMilitia(entityId);
      return;
    }

    if (this.villages.has(entityId)) {
      this.villages.delete(entityId);
      this.villageVillagerCounts.delete(entityId);
      this.villageMilitia.delete(entityId);
    }
  }

  clear(): void {
    this.villages.clear();
    this.villageVillagerCounts.clear();
    this.villagerToVillage.clear();
    this.villageMilitia.clear();
    this.militiaToVillage.clear();
  }
}
