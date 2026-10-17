import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feature, FeatureDocument } from './schemas/feature.schema';
import { ReplaceFeaturesDto } from './dto/replace-features.dto';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import {
  assertProjectAccess,
  assertProjectManager,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';

@Injectable()
export class FeatureService {
  constructor(
    @InjectModel(Feature.name) private readonly model: Model<FeatureDocument>,
    private readonly projects: ClientProjectService,
  ) {}

  async findForProject(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    return this.model.find({ project: projectId }).sort({ order: 1 }).lean();
  }

  /**
   * Replaces the project's whole feature list in one call — diffed by `_id`
   * rather than delete-everything-then-recreate, so an unchanged row keeps
   * its id (and anything that comes to reference a feature, like
   * Task.feature, doesn't dangle) and `order` is simply each row's index in
   * the submitted array. PM (or admin) only, same gate as everything else
   * that edits project structure.
   */
  async replaceForProject(
    projectId: string,
    dto: ReplaceFeaturesDto,
    actor: ProjectAccessActor,
  ) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    assertProjectManager(subject, actor);

    const existing = await this.model
      .find({ project: projectId })
      .select('_id');
    const existingIds = new Set(
      existing.map((f) => (f._id as Types.ObjectId).toString()),
    );
    const keepIds = new Set<string>();

    for (const [index, feature] of dto.features.entries()) {
      if (feature._id && existingIds.has(feature._id)) {
        await this.model.updateOne(
          { _id: feature._id },
          {
            title: feature.title,
            description: feature.description ?? '',
            status: feature.status,
            order: index,
          },
        );
        keepIds.add(feature._id);
      } else {
        const created = await this.model.create({
          project: projectId,
          title: feature.title,
          description: feature.description ?? '',
          status: feature.status,
          order: index,
        });
        keepIds.add((created._id as Types.ObjectId).toString());
      }
    }

    const removedIds = [...existingIds].filter((id) => !keepIds.has(id));
    if (removedIds.length > 0) {
      await this.model.deleteMany({
        _id: { $in: removedIds.map((id) => new Types.ObjectId(id)) },
      });
    }

    return this.findForProject(projectId, actor);
  }
}
