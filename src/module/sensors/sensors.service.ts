import { InjectModel } from '@nestjs/mongoose';
import { Gateway, GatewayDocument } from '../gateways/gateways.schema';
import { Types, Model } from 'mongoose';
import { Sensor, SensorDocument } from './sensors.schema';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class SensorsService {
  constructor(
    @InjectModel(Sensor.name)   private readonly sensorModel : Model<SensorDocument>,
    @InjectModel(Gateway.name)  private readonly gwModel     : Model<GatewayDocument>,
  ) {}

  /** Return sensors for a gateway, scoped to caller’s org */
  async findByGateway(
    gatewayId: string,
    callerOrg: Types.ObjectId,
  ): Promise<SensorDocument[]> {
    /* ensure the gateway belongs to the same org */
    const gw = await this.gwModel
      .findOne({ _id: gatewayId, orgId: callerOrg })
      .lean();
    if (!gw) throw new NotFoundException('Gateway not found in your org');

    return this.sensorModel
      .find({ gatewayId, ignored: { $ne: true } })
      .sort({ lastSeen: -1 })
      .lean();
  }
}
