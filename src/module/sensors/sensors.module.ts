import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sensor, SensorSchema } from './sensors.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Sensor.name, schema: SensorSchema }]),
  ],
  exports: [MongooseModule],
})
export class SensorsModule {}
