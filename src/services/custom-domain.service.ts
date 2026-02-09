import Tenant from '../models/Tenant.model';
import dns from 'dns/promises';
import logger from '../config/logger';

interface DomainVerification {
    domain: string;
    verified: boolean;
    txtRecord?: string;
    verificationToken?: string;
}

class CustomDomainService {
    /**
     * Generate verification token for domain
     */
    generateVerificationToken(tenantId: string, domain: string): string {
        const crypto = require('crypto');
        return crypto
            .createHash('sha256')
            .update(`${tenantId}-${domain}-${process.env.JWT_SECRET}`)
            .digest('hex')
            .substring(0, 32);
    }

    /**
     * Add custom domain to tenant
     */
    async addDomain(tenantId: string, domain: string) {
        // Validate domain format
        const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
        if (!domainRegex.test(domain)) {
            throw new Error('Invalid domain format');
        }

        // Check if domain is already in use
        const existingTenant = await Tenant.findOne({ 'customDomain.domain': domain });
        if (existingTenant && existingTenant._id.toString() !== tenantId) {
            throw new Error('Domain is already in use by another tenant');
        }

        // Generate verification token
        const verificationToken = this.generateVerificationToken(tenantId, domain);

        // Update tenant
        const tenant = await Tenant.findByIdAndUpdate(
            tenantId,
            {
                customDomain: {
                    domain,
                    verified: false,
                    verificationToken,
                    addedAt: new Date(),
                },
            },
            { new: true }
        );

        if (!tenant) {
            throw new Error('Tenant not found');
        }

        logger.info('Custom domain added', { tenantId, domain });

        return {
            domain,
            verified: false,
            verificationToken,
            txtRecord: `gym-verify=${verificationToken}`,
            instructions: [
                'Add the following TXT record to your domain DNS:',
                `Name: _gym-verify.${domain}`,
                `Value: gym-verify=${verificationToken}`,
                'Wait for DNS propagation (up to 48 hours)',
                'Click "Verify Domain" to complete setup',
            ],
        };
    }

    /**
     * Verify domain ownership via DNS TXT record
     */
    async verifyDomain(tenantId: string): Promise<DomainVerification> {
        const tenant = await Tenant.findById(tenantId);

        if (!tenant || !tenant.customDomain) {
            throw new Error('No custom domain configured');
        }

        const { domain, verificationToken } = tenant.customDomain;

        try {
            // Check TXT records
            const txtRecords = await dns.resolveTxt(`_gym-verify.${domain}`);
            const flatRecords = txtRecords.flat();

            // Look for verification token
            const expectedValue = `gym-verify=${verificationToken}`;
            const verified = flatRecords.some((record) => record === expectedValue);

            if (verified) {
                // Update tenant
                tenant.customDomain.verified = true;
                tenant.customDomain.verifiedAt = new Date();
                await tenant.save();

                logger.info('Custom domain verified', { tenantId, domain });

                return {
                    domain,
                    verified: true,
                };
            } else {
                return {
                    domain,
                    verified: false,
                    txtRecord: expectedValue,
                };
            }
        } catch (error: any) {
            logger.error('Domain verification failed', { error, tenantId, domain });

            return {
                domain,
                verified: false,
                txtRecord: `gym-verify=${verificationToken}`,
            };
        }
    }

    /**
     * Remove custom domain
     */
    async removeDomain(tenantId: string) {
        const tenant = await Tenant.findByIdAndUpdate(
            tenantId,
            {
                $unset: { customDomain: 1 },
            },
            { new: true }
        );

        if (!tenant) {
            throw new Error('Tenant not found');
        }

        logger.info('Custom domain removed', { tenantId });

        return {
            success: true,
            message: 'Custom domain removed successfully',
        };
    }

    /**
     * Get domain status
     */
    async getDomainStatus(tenantId: string) {
        const tenant = await Tenant.findById(tenantId);

        if (!tenant || !tenant.customDomain) {
            return {
                configured: false,
            };
        }

        const { domain, verified, verificationToken, addedAt, verifiedAt } = tenant.customDomain;

        return {
            configured: true,
            domain,
            verified,
            verificationToken: verified ? undefined : verificationToken,
            txtRecord: verified ? undefined : `gym-verify=${verificationToken}`,
            addedAt,
            verifiedAt,
        };
    }

    /**
     * Get tenant by custom domain
     */
    async getTenantByDomain(domain: string) {
        const tenant = await Tenant.findOne({
            'customDomain.domain': domain,
            'customDomain.verified': true,
        });

        return tenant;
    }

    /**
     * Check DNS configuration
     */
    async checkDNSConfiguration(domain: string) {
        try {
            const [aRecords, cnameRecords, txtRecords] = await Promise.allSettled([
                dns.resolve4(domain),
                dns.resolveCname(domain),
                dns.resolveTxt(`_gym-verify.${domain}`),
            ]);

            return {
                domain,
                aRecords: aRecords.status === 'fulfilled' ? aRecords.value : [],
                cnameRecords: cnameRecords.status === 'fulfilled' ? cnameRecords.value : [],
                txtRecords: txtRecords.status === 'fulfilled' ? txtRecords.value.flat() : [],
            };
        } catch (error) {
            logger.error('DNS check failed', { error, domain });
            throw new Error('Failed to check DNS configuration');
        }
    }
}

export default new CustomDomainService();
