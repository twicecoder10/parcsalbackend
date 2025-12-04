import { planRepository } from './repository';

export const planService = {
  async listPlans() {
    return planRepository.findAll();
  },

  async getPlanById(id: string) {
    return planRepository.findById(id);
  },

  async getDefaultPlan() {
    return planRepository.findDefault();
  },
};

