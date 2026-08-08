import RichText from "../RichText";

type CaseStudyProps = {
  markdownText: string,
};
const CaseStudy: React.FC<CaseStudyProps> = ({
  markdownText,
}) => {
  return (
    <RichText text={markdownText} />
  );
}

export default CaseStudy;
