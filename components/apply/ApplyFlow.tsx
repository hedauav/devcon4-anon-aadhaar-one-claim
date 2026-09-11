'use client';

import { AnonAadhaarProvider } from '@anon-aadhaar/react';
import ApplicantSteps from './ApplicantSteps';
import type { ApplyFlowProps } from './ApplyFlowLoader';

export default function ApplyFlow({ useTestAadhaar, eligibleState }: ApplyFlowProps) {
  return (
    <AnonAadhaarProvider _useTestAadhaar={useTestAadhaar} _appName="One Claim benefit intake">
      <ApplicantSteps eligibleState={eligibleState} />
    </AnonAadhaarProvider>
  );
}
