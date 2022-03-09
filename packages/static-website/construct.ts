import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as iam from "aws-cdk-lib/aws-iam";
import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * Defines basic properties for a static website
 */
export interface StaticSiteProps {
  domain: string;
  assetsPath: string;
}

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 */
export class StaticSite extends Construct {
  bucket: s3.Bucket;
  cloudfront: cloudfront.CloudFrontWebDistribution;
  cloudfrontAccess: cloudfront.OriginAccessIdentity;

  constructor(scope: Construct, private props: StaticSiteProps) {
    super(scope, props.domain);
  }

  build(): this {
    this.#createS3Bucket();
    this.#allowCloudFrontAccess();
    this.#createCloudFront();
    this.#uploadStaticAssets();

    return this;
  }

  #createS3Bucket() {
    // Create unique bucket per account and region
    this.bucket = new s3.Bucket(this, "SitBucket", {
      bucketName: `${this.props.domain}-${process.env.CDK_DEFAULT_ACCOUNT}-${process.env.CDK_DEFAULT_REGION}`,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });
  }

  #allowCloudFrontAccess() {
    this.cloudfrontAccess = new cloudfront.OriginAccessIdentity(this, "cf-s3-access");
    const s3GetPolicy = new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [this.bucket.arnForObjects("*")],
      principals: [
        new iam.CanonicalUserPrincipal(this.cloudfrontAccess.cloudFrontOriginAccessIdentityS3CanonicalUserId)
      ]
    });
    this.bucket.addToResourcePolicy(s3GetPolicy);
  }

  #createCloudFront() {
    const webAssetsOrigin: cloudfront.SourceConfiguration = {
      s3OriginSource: {
        s3BucketSource: this.bucket,
        originAccessIdentity: this.cloudfrontAccess
      },
      behaviors: [
        {
          isDefaultBehavior: true,
          compress: true,
          allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD_OPTIONS
        }
      ]
    };

    this.cloudfront = new cloudfront.CloudFrontWebDistribution(this, "SiteDistribution", {
      originConfigs: [webAssetsOrigin]
    });
  }

  #uploadStaticAssets() {
    // Deploy site contents to S3 bucket
    new s3deploy.BucketDeployment(this, "DeployWithInvalidation", {
      sources: [s3deploy.Source.asset(this.props.assetsPath)],
      destinationBucket: this.bucket,
      distribution: this.cloudfront,
      distributionPaths: ["/*"]
    });
  }
}
