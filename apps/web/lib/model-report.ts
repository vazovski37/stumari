import metrics from "../../../ml/reports/metrics.json";
import reliability from "../../../ml/reports/reliability.json";

/** The committed evaluation of the pricing model (ml/reports), shown on /model. */
export interface ReliabilityBin {
  mean_predicted: number;
  observed_rate: number;
  count: number;
}

export const modelReport = {
  version: metrics.model_version,
  reliability: {
    binning: reliability.binning,
    before: reliability.before as ReliabilityBin[],
    after: reliability.after as ReliabilityBin[],
  },
  test: {
    bookings: metrics.test.bookings,
    cancelRate: metrics.test.cancel_rate,
    auc: metrics.test.auc,
    aucLeadTimeOnly: metrics.test.auc_lead_time_only,
    brier: metrics.test.brier,
    brierBaseRate: metrics.test.brier_base_rate,
    meanPCancel: metrics.test.mean_p_cancel,
    ece: metrics.test.ece,
    eceUncalibrated: metrics.test.ece_uncalibrated,
    isotonic: metrics.test.alternative_calibration,
    windows: metrics.test.windows,
  },
  training: {
    bookings: metrics.training.bookings,
    trainBookings: metrics.training.bookings_by_split.train,
    split: metrics.training.split,
    trees: metrics.training.trees,
  },
};
