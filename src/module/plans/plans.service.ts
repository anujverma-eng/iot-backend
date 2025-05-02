// src/module/plans/plans.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plan, PlanDocument } from './plans.schema';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
  ) {}

  // ──────────────── stub methods ────────────────
  async create(dto: CreatePlanDto): Promise<Plan> {
    return this.planModel.create(dto);
  }

  async findAll(): Promise<Plan[]> {
    return this.planModel.find().lean();
  }

  async findById(id: string): Promise<Plan | null> {
    return this.planModel.findById(id).lean();
  }

  async update(id: string, dto: UpdatePlanDto): Promise<Plan | null> {
    return this.planModel.findByIdAndUpdate(id, dto, { new: true }).lean();
  }

  // delete is optional for now — many SaaS apps never delete plans
}
